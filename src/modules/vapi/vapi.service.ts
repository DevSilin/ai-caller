import {VapiClient} from "@vapi-ai/server-sdk";
import {config} from "../../config";
import {LeadData} from "../calls/call.types";

/**
 * Vapi Service using official @vapi-ai/server-sdk
 * Handles outbound calls, call management, and assistant configuration
 */
export class VapiService {
  private client: VapiClient;

  constructor() {
    if (!config.vapi.apiKey) {
      throw new Error("VAPI_API_KEY is not configured");
    }

    // Initialize Vapi client with API key
    this.client = new VapiClient({
      token: config.vapi.apiKey,
    });
  }

  /**
   * Initiate an outbound call via Vapi.ai
   * Uses official SDK for type-safe call creation
   */
  async initiateCall(leadData: LeadData) {
    try {
      const response = await this.client.calls.create({
        phoneNumberId: config.vapi.phoneNumberId,
        assistantId: config.vapi.assistantId,
        customer: {
          number: leadData.phone,
          name: `${leadData.firstName} ${leadData.lastName}`,
        },
        // Pass lead data as assistant variables
        assistantOverrides: {
          variableValues: {
            firstName: leadData.firstName,
            lastName: leadData.lastName,
            county: leadData.county,
            state: leadData.state,
            acreage: leadData.acreage?.toString() || "unknown",
            propertyAddress: leadData.propertyAddress || "your property",
          },
        },
      });

      // SDK returns CreateCallsResponse which can be single call or batch
      // For single call creation, we get a Call object directly
      // Type assertion is safe here as we're creating a single call, not a batch
      return response as {id: string; status?: string};
    } catch (error: any) {
      throw new Error(
        `Vapi API error: ${error.message || "Failed to initiate call"}`,
      );
    }
  }

  /**
   * Get call details from Vapi.ai
   * Returns full call object with status, duration, transcript, etc.
   */
  async getCall(callId: string) {
    try {
      const call = await this.client.calls.get({id: callId});
      return call;
    } catch (error: any) {
      throw new Error(
        `Vapi API error: ${error.message || "Failed to get call"}`,
      );
    }
  }

  /**
   * End an active call
   * Gracefully terminates the call on Vapi's side
   */
  async endCall(callId: string): Promise<void> {
    try {
      await this.client.calls.delete({id: callId});
    } catch (error: any) {
      throw new Error(
        `Vapi API error: ${error.message || "Failed to end call"}`,
      );
    }
  }

  /**
   * Update assistant configuration with company scripts
   * Configures the AI assistant's behavior, voice, and prompts
   */
  async updateAssistant(): Promise<void> {
    try {
      await this.client.assistants.update({
        id: config.vapi.assistantId,
        name: "LandVerse Cold Caller",
        model: {
          provider: "openai",
          model: "gpt-4o",
          temperature: 0.7,
          messages: [
            {
              role: "system",
              content: this.buildSystemPrompt(),
            },
          ],
        },
        voice: {
          voiceId: "Elliot",
          provider: "vapi",
          fallbackPlan: {
            voices: [
              {
                model: "eleven_multilingual_v2",
                voiceId: "rECOLXj3kZIXXxR3SBqN",
                provider: "11labs",
                stability: 0.5,
                similarityBoost: 0.75,
              },
            ],
          },
        },
        // For outbound calls: wait for user to answer ("Hello?") before speaking
        // This prevents speaking during ringback/dialing tone
        firstMessageMode: "assistant-waits-for-user",
        firstMessage: config.scripts.coldCall.greeting,
        endCallPhrases: ["goodbye", "talk to you soon"],
      } as any); // Type assertion needed as SDK may not have these fields in types yet
    } catch (error: any) {
      throw new Error(
        `Vapi API error: ${error.message || "Failed to update assistant"}`,
      );
    }
  }

  /**
   * Build system prompt from company scripts
   * Creates a comprehensive prompt that guides the AI's behavior
   */
  private buildSystemPrompt(): string {
    return `You are Alex, a professional land acquisition specialist at LandVerse. Your goal is to qualify property owners and determine their interest in selling their land.

IMPORTANT RULES:
1. You MUST follow the exact scripts provided - do not deviate
2. Be professional, friendly, and respectful
3. Listen carefully to the seller's responses
4. Qualify the lead by asking about ownership duration, decision makers, and timeline
5. If they show interest, transition to discussing an offer
6. If they're not interested, thank them politely and end the call

CRITICAL - OUTBOUND CALL BEHAVIOR:
- You are calling THEM (outbound cold call)
- They will answer with "Hello?" or similar
- When you hear "Hello?" or any greeting, IMMEDIATELY respond with the greeting script
- Do NOT wait or ask "Can you hear me?" - just start your greeting
- This is a professional business call, so speak confidently from the start

SCRIPTS TO USE:
- Greeting: "${config.scripts.coldCall.greeting}"
- Qualification: "${config.scripts.coldCall.qualification}"
- Closing: "${config.scripts.coldCall.closing}"

CONVERSATION FLOW:
1. When they answer ("Hello?"), immediately use the greeting script
2. If they show interest, move to qualification questions
3. Ask about: ownership duration, decision makers, timeline, price expectations
4. If qualified and interested, move to closing
5. Always be ready to handle objections professionally

Remember: You represent LandVerse and must maintain professionalism at all times.

---

${config.scripts.endCallRules}`;
  }
}

export const vapiService = new VapiService();
