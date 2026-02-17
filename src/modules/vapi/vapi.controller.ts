import {FastifyInstance, FastifyRequest, FastifyReply} from "fastify";
import {callService} from "../calls/call.service";
import {CallSummary, CallEntity} from "../calls/call.types";
import {
  vapiWebhookEventSchema,
  StatusUpdateEvent,
  EndOfCallReportEvent,
  ConversationUpdateEvent,
} from "./vapi.schemas";
import {webhookVerificationHook} from "./webhook-verification";
import {config} from "../../config";
import {ZodError} from "zod";

export async function vapiRoutes(app: FastifyInstance) {
  // Custom content type parser to preserve raw body
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    {parseAs: "string"},
    async (req: FastifyRequest, body: string) => {
      // Store raw body for signature verification
      (req as any).rawBody = body;
      // Parse and return JSON
      return JSON.parse(body);
    },
  );

  /**
   * Webhook for Vapi.ai call events
   * POST /webhook/vapi
   */
  app.post(
    "/",
    {
      preHandler: async (req: FastifyRequest, reply: FastifyReply) => {
        await webhookVerificationHook(req, reply, config.vapi.webhookSecret);
      },
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        // Validate webhook event
        const payload = vapiWebhookEventSchema.parse(req.body);
        const {message} = payload;

        app.log.info({message}, "Received Vapi webhook");

        // Handle different event types
        let response: any = {success: true};

        switch (message.type) {
          case "status-update":
            // Handles both call start (status="in-progress") and call end (status="ended")
            await handleStatusUpdate(payload as StatusUpdateEvent);
            break;

          case "end-of-call-report":
            // Optional: process end-of-call-report if enabled in assistant.serverMessages
            await handleEndOfCallReport(payload as EndOfCallReportEvent);
            break;

          case "tool-calls":
            // Handle tool/function calls - requires response
            app.log.info(
              {toolCallList: (message as any).toolCallList},
              "Tool calls event received (requires response)",
            );
            // TODO: Implement tool call handling if needed
            break;

          case "conversation-update":
            // DISABLED: Real-time transcript collection creates duplicates and partial messages
            // We now collect the final, complete transcript from status-update (ended) event
            // This ensures we get clean, accurate transcripts without duplicates or wrong roles
            app.log.debug(
              {vapiCallId: message.call?.id},
              "⏭️  Skipping conversation-update (using final transcript from status-update instead)",
            );
            // await handleConversationUpdate(payload as ConversationUpdateEvent);
            break;

          case "speech-update":
          case "model-output":
          case "hang":
          case "user-interrupted":
            // Known events that we don't handle yet
            app.log.debug(
              {eventType: message.type},
              "Received known Vapi event (not handled)",
            );
            break;

          default:
            // Unknown events
            app.log.debug(
              {eventType: message.type},
              "Received unknown Vapi event (ignoring)",
            );
        }

        return response;
      } catch (error: any) {
        if (error instanceof ZodError) {
          app.log.error({error: error.issues}, "Webhook validation error");
          return reply.status(400).send({
            error: "Invalid webhook payload",
            details: error.issues.map((e: any) => ({
              field: e.path.join("."),
              message: e.message,
            })),
          });
        }
        app.log.error(error);
        return reply.status(500).send({
          error: "Failed to process webhook",
          message: error.message,
        });
      }
    },
  );

  /**
   * Handle status update event
   * Triggered when call status changes: queued → ringing → in-progress → ended
   * When status="ended", also generates call summary from artifact
   */
  async function handleStatusUpdate(event: StatusUpdateEvent): Promise<void> {
    const {message} = event;
    const vapiCallId = message.call?.id;
    const status = message.status;

    if (!vapiCallId || !status) return;

    const call = await callService.getByVapiCallId(vapiCallId);
    if (!call) return;

    // Map Vapi status to our internal status
    if (status === "queued") {
      // Call is queued in Vapi's system
      await callService.updateStatus(call.id, "CALLING");
      app.log.info({vapiCallId}, "Call queued");
    } else if (status === "ringing") {
      // Call is ringing (recipient's phone is ringing)
      await callService.updateStatus(call.id, "CALLING");
      app.log.info({vapiCallId}, "Call ringing");
    } else if (status === "in-progress") {
      await callService.updateStatus(call.id, "IN_PROGRESS");
      app.log.info({vapiCallId}, "Call started (in-progress)");
    } else if (status === "ended") {
      // Call ended - update status and generate summary
      const endReason = message.endedReason || "completed";

      // Determine final status based on end reason
      // SUCCESS reasons - call completed successfully
      const successReasons = [
        "customer-ended-call",
        "assistant-ended-call",
        "silence-timed-out", // Normal end after conversation finished
        "assistant-said-end-call-phrase", // Assistant said goodbye phrase
        "assistant-said-message-too-long",
      ];

      // VOICEMAIL reasons
      const voicemailReasons = ["voicemail", "voicemail-reached"];

      // NO_ANSWER reasons
      const noAnswerReasons = ["no-answer", "no-answer-voicemail"];

      let finalStatus: "COMPLETED" | "FAILED" | "VOICEMAIL" | "NO_ANSWER";

      if (successReasons.includes(endReason)) {
        finalStatus = "COMPLETED";
      } else if (voicemailReasons.some((r) => endReason.includes(r))) {
        finalStatus = "VOICEMAIL";
      } else if (noAnswerReasons.some((r) => endReason.includes(r))) {
        finalStatus = "NO_ANSWER";
      } else {
        // Everything else is a failure (errors, pipeline issues, etc.)
        finalStatus = "FAILED";
      }

      // CRITICAL FIX: Clear existing transcript and replace with final data from Vapi
      // This prevents duplicates and partial messages from conversation-update events
      if (message.artifact?.messages) {
        app.log.info(
          {vapiCallId, messageCount: message.artifact.messages.length},
          "📋 Extracting FINAL transcript from status-update (ended)",
        );

        // Clear existing transcript (may contain partial/duplicate data)
        call.transcript = [];

        // Extract final, complete transcript from Vapi
        extractTranscriptFromMessages(call, message.artifact.messages, true);
        await callService.save(call); // Save transcript first

        app.log.info(
          {vapiCallId, finalTranscriptLength: call.transcript.length},
          "✅ Final transcript saved",
        );
      }

      // Generate error/info message based on status
      let errorMessage: string | undefined;

      if (finalStatus === "FAILED") {
        // Convert technical endReason to user-friendly message
        // Common SIP errors - provide detailed explanation
        if (endReason.includes("sip-503")) {
          errorMessage =
            "Service Unavailable (SIP 503) - recipient's phone service temporarily unavailable";
        } else if (endReason.includes("sip-486")) {
          errorMessage = "Busy Here (SIP 486) - recipient is busy";
        } else if (endReason.includes("sip-480")) {
          errorMessage = "Temporarily Unavailable (SIP 480)";
        } else {
          // For all other errors, format the technical code into readable text
          errorMessage = formatEndReason(endReason);
        }
      } else if (finalStatus === "VOICEMAIL") {
        errorMessage = "Call reached voicemail";
      } else if (finalStatus === "NO_ANSWER") {
        errorMessage = "No answer from recipient";
      }
      // COMPLETED calls don't get error messages

      // Update status (also sets state="END" automatically)
      await callService.updateStatus(call.id, finalStatus, errorMessage);

      // ALWAYS generate and save summary (with or without artifact)
      // Re-fetch call to get latest state after status update
      const updatedCall = await callService.get(call.id);
      if (updatedCall) {
        const summary = generateCallSummary(updatedCall, message.artifact);
        await callService.addSummary(updatedCall.id, summary);
      }

      app.log.info(
        {
          vapiCallId,
          endReason,
          finalStatus,
          cost: message.call?.cost,
          transcriptLength: call.transcript.length,
          summaryGenerated: true,
        },
        "Call ended with summary",
      );
    } else if (
      status === "failed" ||
      status === "busy" ||
      status === "no-answer"
    ) {
      // Map Vapi status to internal status
      const finalStatus =
        status === "no-answer"
          ? "NO_ANSWER"
          : status === "busy"
            ? "FAILED"
            : "FAILED";

      // Generate error message based on status and reason
      let errorMessage = `Call ${status}`;
      if (message.endedReason) {
        errorMessage += ` - Reason: ${message.endedReason}`;
      }
      if (status === "no-answer") {
        errorMessage = "No answer from recipient";
      } else if (status === "busy") {
        errorMessage = "Recipient line was busy";
      } else if (status === "failed" && message.endedReason) {
        // Use Vapi's endedReason for more specific error info
        errorMessage = `Call failed - ${message.endedReason}`;
      }

      await callService.updateStatus(call.id, finalStatus, errorMessage);

      // ALWAYS generate summary even for failed calls
      const updatedCall = await callService.get(call.id);
      if (updatedCall) {
        const summary = generateCallSummary(updatedCall);
        await callService.addSummary(updatedCall.id, summary);
      }

      app.log.warn(
        {vapiCallId, status, errorMessage, summaryGenerated: true},
        "Call failed - summary generated",
      );
    }
  }

  /**
   * Handle end-of-call-report event (optional)
   * This event is sent AFTER status-update with status="ended"
   * Contains comprehensive call data if enabled in assistant.serverMessages
   */
  async function handleEndOfCallReport(
    event: EndOfCallReportEvent,
  ): Promise<void> {
    const {message} = event;
    const vapiCallId = message.call?.id;

    if (!vapiCallId) return;

    const call = await callService.getByVapiCallId(vapiCallId);
    if (!call) return;

    // Extract transcript as final fallback if still empty
    if (call.transcript.length === 0 && message.artifact?.messages) {
      app.log.info(
        {vapiCallId, messageCount: message.artifact.messages.length},
        "📋 Extracting FINAL transcript from end-of-call-report (fallback)",
      );

      // Extract final transcript (no deduplication needed - trust Vapi data)
      extractTranscriptFromMessages(call, message.artifact.messages, true);
      await callService.save(call);

      app.log.info(
        {vapiCallId, finalTranscriptLength: call.transcript.length},
        "✅ Final transcript saved from end-of-call-report",
      );
    }

    // Generate summary as final fallback if not already generated
    if (!call.summary && call.transcript.length > 0) {
      const updatedCall = await callService.get(call.id);
      if (updatedCall) {
        const summary = generateCallSummary(updatedCall, message.artifact);
        await callService.addSummary(updatedCall.id, summary);
        app.log.info(
          {vapiCallId, summaryGenerated: true},
          "Summary generated from end-of-call-report (fallback)",
        );
      }
    }

    // Store recording URL if available
    if (message.artifact?.recordingUrl) {
      app.log.info(
        {vapiCallId, recordingUrl: message.artifact.recordingUrl},
        "Recording URL available",
      );
      // TODO: Store recording URL in call entity if needed
    }

    app.log.info(
      {vapiCallId, cost: message.call?.cost},
      "End-of-call-report processed",
    );
  }

  /**
   * Handle conversation-update event (real-time transcript updates)
   * This is the PRIMARY method for collecting transcripts during the call
   */
  async function handleConversationUpdate(
    event: ConversationUpdateEvent,
  ): Promise<void> {
    const {message} = event;
    const vapiCallId = message.call?.id;

    if (!vapiCallId) return;

    const call = await callService.getByVapiCallId(vapiCallId);
    if (!call) return;

    // Extract messages from conversation-update
    // Try different possible locations for messages
    const messages =
      message.artifact?.messages || message.messages || message.conversation;

    if (!messages || messages.length === 0) return;

    // Extract transcript from messages (only user messages)
    const previousLength = call.transcript.length;
    extractTranscriptFromMessages(call, messages as any);

    // Only save if new transcripts were added
    if (call.transcript.length > previousLength) {
      await callService.save(call);
      app.log.info(
        {
          vapiCallId,
          newMessages: call.transcript.length - previousLength,
          totalMessages: call.transcript.length,
        },
        "Transcript updated from conversation-update",
      );
    }
  }

  /**
   * Finalize call when state machine reaches END
   * Generates summary and updates status to COMPLETED
   */
  async function finalizeCall(call: CallEntity): Promise<void> {
    // Calculate duration (time since call started)
    const duration = call.startedAt
      ? Math.floor((Date.now() - call.startedAt.getTime()) / 1000)
      : 0;

    // Generate summary from transcript
    const transcriptText = call.transcript.map((t) => t.message).join(" ");
    const interestLevel = analyzeInterestLevel(transcriptText);
    const keyPoints = extractKeyPoints(call);
    const outcome = determineOutcome(call, interestLevel);
    const nextAction = determineNextAction(call, interestLevel);

    const summary: CallSummary = {
      duration,
      outcome,
      interestLevel,
      keyPoints,
      nextAction,
      appointmentScheduled: transcriptText
        .toLowerCase()
        .includes("appointment"),
    };

    // Update call with summary and completed status
    await callService.addSummary(call.id, summary);
    await callService.updateStatus(call.id, "COMPLETED");

    app.log.info(
      {
        callId: call.id,
        vapiCallId: call.vapiCallId,
        duration,
        interestLevel,
        transcriptLength: call.transcript.length,
      },
      "Call finalized automatically (state=END)",
    );
  }

  /**
   * Extract transcript from Vapi messages array
   * Adds ALL messages (bot + user) with timestamps for complete conversation history
   *
   * @param call - The call entity to update
   * @param messages - Array of messages from Vapi
   * @param isFinalTranscript - If true, trusts Vapi data completely without deduplication (for end-of-call)
   */
  function extractTranscriptFromMessages(
    call: CallEntity,
    messages: Array<{
      role: string;
      message?: string;
      content?: string;
      time?: number;
      secondsFromStart?: number;
    }>,
    isFinalTranscript: boolean = false,
  ): void {
    // Filter out system messages and empty messages
    const validMessages = messages
      .filter((m) => m.role === "user" || m.role === "bot")
      .filter((m) => {
        const text = (m.message || m.content || "").trim();
        return text.length > 0;
      });

    if (isFinalTranscript) {
      // FINAL TRANSCRIPT MODE: Trust Vapi's data completely, no deduplication
      // This is used when call ends and we get the definitive transcript
      for (const msg of validMessages) {
        const text = (msg.message || msg.content || "").trim();
        call.transcript.push({
          role: msg.role as "user" | "bot",
          message: text,
          time: msg.time,
          secondsFromStart: msg.secondsFromStart,
        });
      }
    } else {
      // REAL-TIME MODE: Use deduplication to prevent partial updates
      // This is used during the call when conversation-update events arrive
      const existingMessages = new Set(
        call.transcript.map(
          (t) => `${t.role}:${t.message.trim().toLowerCase()}:${t.time || 0}`,
        ),
      );

      for (const msg of validMessages) {
        const text = (msg.message || msg.content || "").trim();
        const messageId = `${msg.role}:${text.toLowerCase()}:${msg.time || 0}`;

        if (!existingMessages.has(messageId)) {
          call.transcript.push({
            role: msg.role as "user" | "bot",
            message: text,
            time: msg.time,
            secondsFromStart: msg.secondsFromStart,
          });
          existingMessages.add(messageId);
        }
      }
    }

    // Sort transcript by time to maintain correct order
    call.transcript.sort((a, b) => {
      const timeA = a.time || a.secondsFromStart || 0;
      const timeB = b.time || b.secondsFromStart || 0;
      return timeA - timeB;
    });
  }

  /**
   * Generate call summary from call data
   * Works with or without artifact - ALWAYS generates summary
   */
  function generateCallSummary(call: CallEntity, artifact?: any): CallSummary {
    // Calculate duration from artifact messages if available, otherwise estimate
    let duration = 0;
    if (artifact?.messages) {
      const botMessages = artifact.messages.filter(
        (m: any) => m.role === "bot",
      );
      duration =
        botMessages.length > 0
          ? Math.max(
              ...botMessages.map((m: any) => (m.endTime || m.time || 0) / 1000),
            )
          : 0;
    } else if (call.startedAt && call.completedAt) {
      // Calculate duration from timestamps
      duration = Math.floor(
        (new Date(call.completedAt).getTime() -
          new Date(call.startedAt).getTime()) /
          1000,
      );
    }

    const transcriptText = call.transcript.map((t) => t.message).join(" ");

    // Analyze transcript for interest level
    const interestLevel = analyzeInterestLevel(transcriptText);

    // Extract key points
    const keyPoints = extractKeyPoints(call);

    // Determine outcome
    const outcome = determineOutcome(call, interestLevel);

    // Determine next action
    const nextAction = determineNextAction(call, interestLevel);

    return {
      duration,
      outcome,
      interestLevel,
      keyPoints,
      nextAction,
      appointmentScheduled:
        call.state === "CLOSING" && interestLevel !== "NOT_INTERESTED",
    };
  }

  /**
   * Analyze interest level from transcript
   */
  function analyzeInterestLevel(
    transcript: string,
  ): "HOT" | "WARM" | "COLD" | "NOT_INTERESTED" {
    const lower = transcript.toLowerCase();

    // Hot signals
    if (
      lower.includes("yes") ||
      lower.includes("interested") ||
      lower.includes("how much") ||
      lower.includes("make an offer")
    ) {
      return "HOT";
    }

    // Not interested signals
    if (
      lower.includes("not interested") ||
      lower.includes("no thanks") ||
      lower.includes("don't call")
    ) {
      return "NOT_INTERESTED";
    }

    // Warm signals
    if (
      lower.includes("maybe") ||
      lower.includes("thinking about") ||
      lower.includes("tell me more")
    ) {
      return "WARM";
    }

    return "COLD";
  }

  /**
   * Extract key points from call
   */
  function extractKeyPoints(call: CallEntity): string[] {
    const points: string[] = [];

    if (call.leadData) {
      points.push(
        `Property: ${call.leadData.acreage || "?"} acres in ${call.leadData.county} County, ${call.leadData.state}`,
      );
    }

    if (call.state === "QUALIFICATION") {
      points.push("Lead qualified - answered qualification questions");
    }

    if (call.state === "CLOSING") {
      points.push("Reached closing stage - discussed offer");
    }

    if (call.transcript.length > 0) {
      points.push(`Conversation length: ${call.transcript.length} exchanges`);
    }

    return points;
  }

  /**
   * Determine call outcome
   */
  function determineOutcome(call: CallEntity, interestLevel: string): string {
    if (interestLevel === "NOT_INTERESTED") {
      return "Not interested in selling";
    }

    if (call.state === "END") {
      if (interestLevel === "HOT") {
        return "Appointment scheduled";
      }
      return "Call completed";
    }

    if (call.state === "CLOSING") {
      return "Discussed offer - follow up needed";
    }

    if (call.state === "QUALIFICATION") {
      return "Lead qualified - needs offer";
    }

    return "Initial contact made";
  }

  /**
   * Determine next action
   */
  function determineNextAction(
    call: CallEntity,
    interestLevel: string,
  ): string | undefined {
    if (interestLevel === "NOT_INTERESTED") {
      return "Mark as not interested";
    }

    if (interestLevel === "HOT") {
      if (call.state === "CLOSING" || call.state === "END") {
        return "Send offer via email";
      }
      return "Schedule follow-up call";
    }

    if (interestLevel === "WARM") {
      return "Follow up in 1 week";
    }

    if (interestLevel === "COLD") {
      return "Follow up in 2-4 weeks";
    }

    return undefined;
  }

  /**
   * Format technical endReason code into user-friendly message
   * Example: "pipeline-error-openai-voice-failed" → "Pipeline error: openai voice failed"
   */
  function formatEndReason(endReason: string): string {
    // Remove common prefixes
    let formatted = endReason
      .replace(/^call\.(in-progress\.)?/, "")
      .replace(/^pipeline-error-/, "Pipeline error: ")
      .replace(/^error-/, "");

    // Replace dashes and underscores with spaces
    formatted = formatted.replace(/[-_]/g, " ");

    // Capitalize first letter
    formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);

    return formatted;
  }
}
