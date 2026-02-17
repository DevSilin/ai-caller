import dotenv from "dotenv";

dotenv.config();

/**
 * Validate required environment variables
 */
function validateEnv() {
  const required = [
    "VAPI_API_KEY",
    "VAPI_PHONE_NUMBER_ID",
    "VAPI_ASSISTANT_ID",
  ];

  const missing: string[] = [];

  for (const key of required) {
    if (!process.env[key] || process.env[key]?.trim() === "") {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `❌ Missing required environment variables:\n${missing.map((key) => `  - ${key}`).join("\n")}\n\nPlease set these variables in your .env file or environment.`,
    );
  }

  // Warning for optional but recommended variables
  if (!process.env.VAPI_WEBHOOK_SECRET) {
    console.warn(
      "⚠️  WARNING: VAPI_WEBHOOK_SECRET is not set. Webhook signature verification is disabled.",
    );
    console.warn(
      "   This is a SECURITY RISK in production. Please set VAPI_WEBHOOK_SECRET in your .env file.",
    );
  }
}

// Validate on module load
validateEnv();

export const config = {
  // Server
  port: parseInt(process.env.PORT || "3000"),
  nodeEnv: process.env.NODE_ENV || "development",

  // Database
  databasePath: process.env.DATABASE_PATH || "./data/calls.db",

  // Vapi.ai (guaranteed to be present after validateEnv())
  vapi: {
    apiKey: process.env.VAPI_API_KEY!,
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID!,
    assistantId: process.env.VAPI_ASSISTANT_ID!,
    webhookSecret: process.env.VAPI_WEBHOOK_SECRET || "",
    apiUrl: "https://api.vapi.ai",
  },

  // Company Scripts (fixed, users cannot modify)
  scripts: {
    coldCall: {
      greeting:
        "Hi {{firstName}}, this is Alex with LandVerse. I'm calling about your property in {{county}} County. We buy land for cash and I wanted to see if you'd ever consider selling. Got a minute?",
      qualification:
        "Great! Let me ask you a few quick questions. How long have you owned the property?",
      closing:
        "Based on what you've told me, we'd be interested in making you an offer. Would you like to hear what we could pay?",
    },
    voicemail: {
      first:
        "Hi {{firstName}}, this is Alex with LandVerse. I'm calling about your property in {{county}} County. We buy land for cash. Give me a call back at {{phone}}. Thanks!",
      followUp:
        "Hi {{firstName}}, Alex again with LandVerse. Just following up about your property. Call me at {{phone}} when you get a chance. Thanks!",
    },
    // End Call Rules - for use when "Enable End Call Function" is turned ON in Vapi Dashboard
    // These rules prevent premature call termination and ensure all interested leads are properly handled
    endCallRules: `CRITICAL: END CALL RULES - NEVER BREAK THESE:

1. NEVER end the call if:
   - You asked a question and haven't received a full answer
   - The customer expressed interest ("great", "yes", "sounds good", "okay", "sure", "interested")
   - You started making an offer but haven't completed it
   - You mentioned making an offer but haven't stated the actual price/terms yet
   - The customer asked a question that you haven't answered
   - There are ANY unfinished topics in the conversation
   - You're in the middle of explaining something

2. ONLY end the call when:
   - Customer explicitly says goodbye/bye/talk to you later/have a good day/take care
   - Customer explicitly says "I'm not interested" AND you've tried one follow-up question AND they still refuse
   - Customer asks you to end the call ("I have to go", "goodbye", etc.)
   - Customer has clearly declined AND you've completed your closing attempt

3. When customer shows interest ("great", "okay", "yes", etc.):
   - COMPLETE your offer/proposal FIRST
   - State the actual price or next steps
   - Get their contact details for follow-up if needed
   - Ask if they have any questions
   - ONLY THEN, after they say goodbye, end the call

4. Critical sales moments - NEVER end the call:
   - Right after asking "would you like to hear our offer?"
   - Right after customer says "okay" or "sure" to hearing an offer
   - During property qualification questions
   - Before you've given them a chance to ask questions

REMEMBER: Ending call prematurely = losing a sale. When in doubt, DO NOT end the call.
Let the customer end the call naturally. Be conservative with ending calls.`,
  },
};
