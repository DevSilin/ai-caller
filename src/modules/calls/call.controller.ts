import {FastifyInstance, FastifyRequest, FastifyReply} from "fastify";
import {callService} from "./call.service";
import {vapiService} from "../vapi/vapi.service";
import {
  leadDataSchema,
  getCallsQuerySchema,
  callIdParamsSchema,
  LeadDataInput,
} from "./call.schemas";
import {ZodError} from "zod";

export async function callRoutes(app: FastifyInstance) {
  /**
   * Update Vapi assistant configuration
   * POST /calls/update-assistant
   */
  app.post("/update-assistant", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await vapiService.updateAssistant();
      return {
        success: true,
        message: "Vapi assistant updated successfully",
      };
    } catch (error: any) {
      app.log.error("Failed to update assistant:", error);
      return reply.status(500).send({
        success: false,
        error: "Failed to update assistant",
        message: error.message,
      });
    }
  });

  /**
   * Initiate an outbound call
   * POST /calls/start
   */
  app.post(
    "/start",
    async (req: FastifyRequest<{Body: LeadDataInput}>, reply: FastifyReply) => {
      let call;

      try {
        // Validate request body
        const leadData = leadDataSchema.parse(req.body);

        // Create call record
        call = await callService.create(leadData.phone, leadData);

        // Update status to calling
        await callService.updateStatus(call.id, "CALLING");

        // Initiate call via Vapi
        const vapiCall = await vapiService.initiateCall(leadData);

        // Update call with Vapi call ID
        call.vapiCallId = vapiCall.id;
        await callService.save(call);

        return {
          success: true,
          callId: call.id,
          vapiCallId: vapiCall.id,
          status: "CALLING",
          message: `Call initiated to ${leadData.firstName} ${leadData.lastName}`,
        };
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.status(400).send({
            error: "Validation error",
            details: error.issues.map((e: any) => ({
              field: e.path.join("."),
              message: e.message,
            })),
          });
        }

        // If call was created but Vapi failed, update status to FAILED
        if (call) {
          await callService.updateStatus(
            call.id,
            "FAILED",
            `Failed to initiate call: ${error.message}`,
          );
          app.log.error({callId: call.id, error: error.message}, "Call failed");
        }

        app.log.error(error);
        return reply.status(500).send({
          error: "Failed to initiate call",
          message: error.message,
          callId: call?.id,
        });
      }
    },
  );

  /**
   * Get all calls
   * GET /calls
   */
  app.get(
    "/",
    async (
      req: FastifyRequest<{
        Querystring: {status?: string; limit?: string};
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const query = getCallsQuerySchema.parse(req.query);

        let calls;
        if (query.status) {
          calls = await callService.getByStatus(query.status);
        } else {
          calls = await callService.getRecent(query.limit || 50);
        }

        return {
          success: true,
          count: calls.length,
          calls,
        };
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.status(400).send({
            error: "Validation error",
            details: error.issues.map((e) => ({
              field: e.path.join("."),
              message: e.message,
            })),
          });
        }
        app.log.error(error);
        return reply.status(500).send({
          error: "Failed to get calls",
          message: error.message,
        });
      }
    },
  );

  /**
   * Get last call with detailed Vapi info for debugging
   * GET /calls/debug-last
   */
  app.get("/debug-last", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const calls = await callService.getAll();
      if (calls.length === 0) {
        return reply.status(404).send({
          error: "No calls found",
        });
      }

      // Get most recent call
      const lastCall = calls.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0];

      // Fetch detailed info from Vapi if available
      let vapiDetails = null;
      if (lastCall.vapiCallId) {
        try {
          vapiDetails = await vapiService.getCall(lastCall.vapiCallId);
        } catch (error: any) {
          app.log.warn("Could not fetch Vapi details:", error.message);
        }
      }

      return {
        call: lastCall,
        vapiDetails: vapiDetails,
        diagnostic: {
          hasVapiId: !!lastCall.vapiCallId,
          status: lastCall.status,
          state: lastCall.state,
          errorMessage: lastCall.errorMessage,
          transcriptLength: lastCall.transcript.length,
          hasSummary: !!lastCall.summary,
        },
      };
    } catch (error: any) {
      app.log.error("Failed to get last call debug info:", error);
      return reply.status(500).send({
        error: "Failed to get debug info",
        message: error.message,
      });
    }
  });

  /**
   * Get call summary/report
   * GET /calls/:id/summary
   */
  app.get(
    "/:id/summary",
    async (
      req: FastifyRequest<{Params: {id: string}}>,
      reply: FastifyReply,
    ) => {
      try {
        const {id} = callIdParamsSchema.parse(req.params);
        const call = await callService.get(id);

        if (!call) {
          return reply.status(404).send({error: "Call not found"});
        }

        if (!call.summary) {
          return reply
            .status(404)
            .send({error: "Call summary not available yet"});
        }

        return {
          success: true,
          callId: call.id,
          leadData: call.leadData,
          summary: call.summary,
          status: call.status,
          duration: call.summary.duration,
          outcome: call.summary.outcome,
          interestLevel: call.summary.interestLevel,
          keyPoints: call.summary.keyPoints,
          nextAction: call.summary.nextAction,
        };
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.status(400).send({
            error: "Validation error",
            details: error.issues.map((e) => ({
              field: e.path.join("."),
              message: e.message,
            })),
          });
        }
        app.log.error(error);
        return reply.status(500).send({
          error: "Failed to get call summary",
          message: error.message,
        });
      }
    },
  );

  /**
   * End an active call
   * POST /calls/:id/end
   */
  app.post(
    "/:id/end",
    async (
      req: FastifyRequest<{Params: {id: string}}>,
      reply: FastifyReply,
    ) => {
      try {
        const {id} = callIdParamsSchema.parse(req.params);
        const call = await callService.get(id);

        if (!call) {
          return reply.status(404).send({error: "Call not found"});
        }

        if (call.vapiCallId) {
          await vapiService.endCall(call.vapiCallId);
        }

        await callService.updateStatus(id, "COMPLETED");

        return {
          success: true,
          message: "Call ended",
        };
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.status(400).send({
            error: "Validation error",
            details: error.issues.map((e) => ({
              field: e.path.join("."),
              message: e.message,
            })),
          });
        }
        app.log.error(error);
        return reply.status(500).send({
          error: "Failed to end call",
          message: error.message,
        });
      }
    },
  );

  /**
   * Generate summary for a call manually
   * POST /calls/:id/generate-summary
   */
  app.post(
    "/:id/generate-summary",
    async (
      req: FastifyRequest<{Params: {id: string}}>,
      reply: FastifyReply,
    ) => {
      try {
        const {id} = callIdParamsSchema.parse(req.params);
        const call = await callService.get(id);

        if (!call) {
          return reply.status(404).send({error: "Call not found"});
        }

        if (call.transcript.length === 0) {
          return reply.status(400).send({
            error: "Cannot generate summary - no transcript available",
          });
        }

        // Generate summary from existing call data
        const transcriptText = call.transcript.map((t) => t.message).join(" ");
        const interestLevel = analyzeInterestLevel(transcriptText);
        const keyPoints = extractKeyPoints(call);
        const outcome = determineOutcome(call, interestLevel);
        const nextAction = determineNextAction(call, interestLevel);

        const summary = {
          duration: 0, // Duration unknown without artifact
          outcome,
          interestLevel,
          keyPoints,
          nextAction,
          appointmentScheduled:
            call.state === "CLOSING" && interestLevel !== "NOT_INTERESTED",
        };

        await callService.addSummary(id, summary);

        return {
          success: true,
          message: "Summary generated successfully",
          summary,
        };
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.status(400).send({
            error: "Validation error",
            details: error.issues.map((e) => ({
              field: e.path.join("."),
              message: e.message,
            })),
          });
        }
        app.log.error(error);
        return reply.status(500).send({
          error: "Failed to generate summary",
          message: error.message,
        });
      }
    },
  );

  /**
   * Get call details
   * GET /calls/:id
   * IMPORTANT: This route MUST be last among GET routes because it uses :id parameter
   */
  app.get(
    "/:id",
    async (
      req: FastifyRequest<{Params: {id: string}}>,
      reply: FastifyReply,
    ) => {
      try {
        const {id} = callIdParamsSchema.parse(req.params);
        const call = await callService.get(id);

        if (!call) {
          return reply.status(404).send({error: "Call not found"});
        }

        return call;
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.status(400).send({
            error: "Validation error",
            details: error.issues.map((e) => ({
              field: e.path.join("."),
              message: e.message,
            })),
          });
        }
        app.log.error(error);
        return reply.status(500).send({
          error: "Failed to get call",
          message: error.message,
        });
      }
    },
  );
}

// Helper functions for summary generation
function analyzeInterestLevel(
  transcript: string,
): "HOT" | "WARM" | "COLD" | "NOT_INTERESTED" {
  const lower = transcript.toLowerCase();

  if (
    lower.includes("yes") ||
    lower.includes("interested") ||
    lower.includes("how much") ||
    lower.includes("make an offer")
  ) {
    return "HOT";
  }

  if (
    lower.includes("not interested") ||
    lower.includes("no thanks") ||
    lower.includes("don't call")
  ) {
    return "NOT_INTERESTED";
  }

  if (
    lower.includes("maybe") ||
    lower.includes("thinking about") ||
    lower.includes("tell me more")
  ) {
    return "WARM";
  }

  return "COLD";
}

function extractKeyPoints(call: any): string[] {
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
    points.push(`Conversation length: ${call.transcript.length} messages`);
  }

  return points;
}

function determineOutcome(call: any, interestLevel: string): string {
  if (call.status === "COMPLETED" && interestLevel === "HOT") {
    return "Lead qualified - needs offer";
  }
  if (call.status === "COMPLETED" && interestLevel === "WARM") {
    return "Lead interested - needs follow-up";
  }
  if (interestLevel === "NOT_INTERESTED") {
    return "Lead not interested";
  }
  if (call.status === "NO_ANSWER") {
    return "No answer - schedule callback";
  }
  if (call.status === "VOICEMAIL") {
    return "Voicemail left - awaiting callback";
  }
  return "Call completed";
}

function determineNextAction(call: any, interestLevel: string): string {
  if (interestLevel === "HOT") {
    return "Send offer via email";
  }
  if (interestLevel === "WARM") {
    return "Schedule follow-up call";
  }
  if (interestLevel === "NOT_INTERESTED") {
    return "Mark as do not contact";
  }
  if (call.status === "NO_ANSWER") {
    return "Retry call in 2 days";
  }
  if (call.status === "VOICEMAIL") {
    return "Wait for callback, retry if no response in 3 days";
  }
  return "Review transcript";
}
