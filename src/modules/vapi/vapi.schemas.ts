import {z} from "zod";

/**
 * Vapi webhook event types (from real webhook analysis):
 * - status-update: Call status changes (in-progress, ended, failed, etc.)
 * - transcript: Conversation transcripts (user and assistant messages)
 * - function-call: Custom function invocations
 * - speech-update: Speech recognition updates
 * - conversation-update: Conversation flow updates
 * - And others...
 *
 * We accept ALL event types to avoid 400 errors, but only handle the ones we need.
 */

/**
 * Vapi webhook payload structure (from real webhook payload analysis)
 * Structure: { message: { type, status, call, artifact, ... } }
 */
const vapiMessageSchema = z
  .object({
    timestamp: z.number().optional(),
    type: z.string(), // Event type

    // For status-update events
    status: z.string().optional(), // "queued" | "ringing" | "in-progress" | "ended" | "failed"
    endedReason: z.string().optional(), // "customer-ended-call", "assistant-ended-call", etc.

    // Artifact contains full conversation history and metadata
    artifact: z
      .object({
        messages: z
          .array(
            z
              .object({
                role: z.string(), // "system" | "bot" | "user"
                message: z.string().optional(), // Optional: Vapi sometimes omits this field
                content: z.string().optional(), // Alternative field used by Vapi
                time: z.number().optional(),
                endTime: z.number().optional(),
                secondsFromStart: z.number().optional(),
                duration: z.number().optional(),
              })
              .passthrough(),
          )
          .optional(),
        messagesOpenAIFormatted: z.array(z.any()).optional(),
      })
      .passthrough()
      .optional(),

    // Call object with full details
    call: z
      .object({
        id: z.string(),
        status: z.string().optional(),
        type: z.string().optional(),
        cost: z.number().optional(),
        createdAt: z.string().optional(),
        updatedAt: z.string().optional(),
        assistantId: z.string().optional(),
        phoneNumberId: z.string().optional(),
      })
      .passthrough()
      .optional(),

    // For transcript events
    role: z.string().optional(), // "user" | "assistant"
    transcript: z
      .union([
        z.string(),
        z.object({
          text: z.string(),
          role: z.string().optional(),
        }),
      ])
      .optional(),
    transcriptType: z.string().optional(), // "partial" | "final"

    // For tool-calls events (function invocations)
    toolCallList: z
      .array(
        z.object({
          id: z.string().optional(),
          type: z.string().optional(),
          function: z
            .object({
              name: z.string(),
              arguments: z.string().optional(), // JSON string
            })
            .optional(),
        }),
      )
      .optional(),

    // Legacy field for backward compatibility
    functionCall: z
      .object({
        name: z.string(),
        parameters: z.record(z.string(), z.any()).optional(),
      })
      .optional(),

    // Additional context (full objects from Vapi)
    phoneNumber: z.any().optional(),
    customer: z.any().optional(),
    assistant: z.any().optional(),
  })
  .passthrough(); // Allow any additional fields from Vapi

/**
 * Main webhook payload schema
 * Vapi wraps everything in a "message" object
 */
export const vapiWebhookEventSchema = z.object({
  message: vapiMessageSchema,
});

export type VapiWebhookEvent = z.infer<typeof vapiWebhookEventSchema>;
export type VapiMessage = z.infer<typeof vapiMessageSchema>;

// Type helpers for specific events (for type-safe handling)

/**
 * status-update event
 * Sent when call status changes: in-progress → ended
 * When status="ended", also includes endedReason and full artifact
 */
export type StatusUpdateEvent = {
  message: {
    type: "status-update";
    status: string; // "in-progress" | "ended" | "failed" | etc.
    endedReason?: string; // Only present when status="ended"
    artifact?: {
      messages?: Array<{
        role: string;
        message?: string; // Optional: Vapi sometimes omits this
        content?: string; // Alternative field
        time?: number;
        endTime?: number;
        secondsFromStart?: number;
        duration?: number;
      }>;
    };
    call: {
      id: string;
      status?: string;
      cost?: number;
    };
  };
};

/**
 * end-of-call-report event
 * Sent after call ends with comprehensive data (if enabled in assistant.serverMessages)
 * May contain: recording URL, full transcript, analysis, costs, etc.
 */
export type EndOfCallReportEvent = {
  message: {
    type: "end-of-call-report";
    call: {
      id: string;
      cost?: number;
    };
    endedReason?: string;
    artifact?: {
      messages?: Array<{
        role: string;
        message?: string; // Optional: Vapi sometimes omits this
        content?: string; // Alternative field
        time?: number;
        duration?: number;
      }>;
      transcript?: string;
      recordingUrl?: string;
    };
  };
};

/**
 * conversation-update event
 * Sent during the call with real-time conversation updates
 * Contains full conversation history up to this point
 */
export type ConversationUpdateEvent = {
  message: {
    type: "conversation-update";
    call: {id: string};
    conversation?: Array<{
      role: "system" | "assistant" | "user";
      content: string;
    }>;
    messages?: Array<{
      role: string;
      message?: string; // Optional: Vapi sometimes omits this
      content?: string; // Alternative field
      time?: number;
      endTime?: number;
      secondsFromStart?: number;
      duration?: number;
    }>;
    artifact?: {
      messages?: Array<{
        role: string;
        message?: string; // Optional: Vapi sometimes omits this
        content?: string; // Alternative field
        time?: number;
        endTime?: number;
        secondsFromStart?: number;
        duration?: number;
      }>;
    };
  };
};
