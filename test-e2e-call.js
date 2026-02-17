/**
 * End-to-End Test: Real Vapi Call
 *
 * This script:
 * 1. Initiates a real call through Vapi.ai
 * 2. Monitors the call status in real-time
 * 3. Shows transcripts as they arrive
 * 4. Displays the final call summary
 *
 * Usage:
 *   node test-e2e-call.js +15551234567
 *
 * Requirements:
 * - Server must be running (npm run dev)
 * - ngrok must be running and configured in Vapi
 * - VAPI_WEBHOOK_SECRET must be set correctly
 */

const axios = require("axios");
const readline = require("readline");

const BASE_URL = "http://localhost:3000";
const POLL_INTERVAL = 2000; // 2 seconds

// ANSI colors
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

function log(color, prefix, message) {
  console.log(`${color}${prefix}${colors.reset} ${message}`);
}

function clearLine() {
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
}

/**
 * Start a call
 */
async function startCall(phoneNumber) {
  log(colors.blue, "📞", `Initiating call to ${phoneNumber}...`);

  try {
    const response = await axios.post(`${BASE_URL}/calls/start`, {
      firstName: "Antonio",
      lastName: "Lastname",
      phone: phoneNumber,
      county: "USA",
      state: "ST",
      acreage: 5.0,
      propertyAddress: "Test Address",
    });

    const {callId, vapiCallId, status} = response.data;

    log(colors.green, "✅", "Call initiated successfully!");
    log(colors.cyan, "🆔", `Call ID: ${callId}`);
    log(colors.cyan, "🆔", `Vapi Call ID: ${vapiCallId}`);
    log(colors.cyan, "📊", `Status: ${status}`);

    return callId;
  } catch (error) {
    log(
      colors.red,
      "❌",
      `Failed to start call: ${error.response?.data?.message || error.message}`,
    );
    if (error.response?.data?.details) {
      console.log("Details:", error.response.data.details);
    }
    throw error;
  }
}

/**
 * Get call details
 */
async function getCallDetails(callId) {
  try {
    const response = await axios.get(`${BASE_URL}/calls/${callId}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Monitor call progress
 */
async function monitorCall(callId) {
  log(colors.yellow, "👀", "Monitoring call progress...\n");

  let lastStatus = null;
  let lastState = null;
  let lastTranscriptLength = 0;
  let pollCount = 0;
  const maxPolls = 120; // 4 minutes max

  while (pollCount < maxPolls) {
    const call = await getCallDetails(callId);

    if (!call) {
      log(colors.red, "❌", "Call not found!");
      break;
    }

    // Status changed
    if (call.status !== lastStatus) {
      lastStatus = call.status;
      const statusEmoji = {
        PENDING: "⏳",
        CALLING: "📞",
        IN_PROGRESS: "🗣️",
        COMPLETED: "✅",
        FAILED: "❌",
        NO_ANSWER: "📵",
        VOICEMAIL: "📧",
      };
      log(
        colors.bright,
        statusEmoji[call.status] || "📊",
        `Status: ${call.status}`,
      );
    }

    // State changed
    if (call.state !== lastState) {
      lastState = call.state;
      const stateEmoji = {
        GREETING: "👋",
        QUALIFICATION: "❓",
        CLOSING: "🤝",
        END: "🏁",
      };
      log(
        colors.magenta,
        stateEmoji[call.state] || "🔄",
        `State Machine: ${call.state}`,
      );
    }

    // New transcripts
    if (call.transcript && call.transcript.length > lastTranscriptLength) {
      const newTranscripts = call.transcript.slice(lastTranscriptLength);
      newTranscripts.forEach((text, index) => {
        const number = lastTranscriptLength + index + 1;
        log(colors.cyan, `💬 [${number}]`, text);
      });
      lastTranscriptLength = call.transcript.length;
    }

    // Call completed
    if (
      call.status === "COMPLETED" ||
      call.status === "FAILED" ||
      call.status === "NO_ANSWER"
    ) {
      log(colors.green, "🏁", "Call finished!");
      return call;
    }

    // Progress indicator
    process.stdout.write(
      colors.yellow +
        "⏳ Polling" +
        ".".repeat((pollCount % 3) + 1) +
        "   \r" +
        colors.reset,
    );

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
    pollCount++;
  }

  if (pollCount >= maxPolls) {
    log(colors.yellow, "⚠️", "Monitoring timeout reached");
  }

  return await getCallDetails(callId);
}

/**
 * Display call summary
 */
async function displaySummary(callId) {
  log(colors.blue, "\n📋", "Fetching call summary...");

  try {
    const response = await axios.get(`${BASE_URL}/calls/${callId}/summary`);
    const {summary, leadData} = response.data;

    console.log("\n" + "=".repeat(60));
    console.log(colors.bright + "📊 CALL SUMMARY" + colors.reset);
    console.log("=".repeat(60));

    console.log(`\n${colors.cyan}Lead Information:${colors.reset}`);
    console.log(`  Name: ${leadData.firstName} ${leadData.lastName}`);
    console.log(`  Phone: ${leadData.phone}`);
    console.log(`  Location: ${leadData.county} County, ${leadData.state}`);
    if (leadData.acreage) {
      console.log(`  Property: ${leadData.acreage} acres`);
    }

    console.log(`\n${colors.cyan}Call Metrics:${colors.reset}`);
    console.log(
      `  Duration: ${Math.floor(summary.duration / 60)}m ${summary.duration % 60}s`,
    );
    console.log(`  Outcome: ${summary.outcome}`);

    const interestColor = {
      HOT: colors.red,
      WARM: colors.yellow,
      COLD: colors.blue,
      NOT_INTERESTED: colors.reset,
    };
    console.log(
      `  Interest Level: ${interestColor[summary.interestLevel] || ""}${summary.interestLevel}${colors.reset}`,
    );

    if (summary.keyPoints && summary.keyPoints.length > 0) {
      console.log(`\n${colors.cyan}Key Points:${colors.reset}`);
      summary.keyPoints.forEach((point) => {
        console.log(`  • ${point}`);
      });
    }

    if (summary.nextAction) {
      console.log(`\n${colors.cyan}Next Action:${colors.reset}`);
      console.log(`  ➡️  ${summary.nextAction}`);
    }

    if (summary.appointmentScheduled) {
      console.log(`\n${colors.green}✅ Appointment Scheduled!${colors.reset}`);
    }

    console.log("\n" + "=".repeat(60) + "\n");
  } catch (error) {
    if (error.response?.status === 404) {
      log(colors.yellow, "⚠️", "Call summary not available yet");
    } else {
      log(colors.red, "❌", `Failed to get summary: ${error.message}`);
    }
  }
}

/**
 * Main function
 */
async function main() {
  const phoneNumber = process.argv[2];

  if (!phoneNumber) {
    console.log(`
${colors.red}❌ Phone number required!${colors.reset}

Usage:
  node test-e2e-call.js +15551234567

Example:
  node test-e2e-call.js +15551234567

${colors.yellow}⚠️  Important:${colors.reset}
- Replace with YOUR real phone number for testing
- Number must be in E.164 format (start with +)
- Make sure server is running (npm run dev)
- Make sure ngrok is running and configured in Vapi
`);
    process.exit(1);
  }

  // Validate phone format
  if (!/^\+[1-9]\d{10,14}$/.test(phoneNumber)) {
    log(
      colors.red,
      "❌",
      "Invalid phone format. Must be E.164 format (e.g., +15551234567)",
    );
    process.exit(1);
  }

  console.log("\n" + "=".repeat(60));
  console.log(colors.bright + "🚀 END-TO-END CALL TEST" + colors.reset);
  console.log("=".repeat(60) + "\n");

  try {
    // Step 1: Start call
    const callId = await startCall(phoneNumber);
    console.log("");

    // Step 2: Monitor call
    const finalCall = await monitorCall(callId);

    if (finalCall) {
      // Step 3: Display summary
      await displaySummary(callId);

      // Step 4: Final verdict
      if (finalCall.status === "COMPLETED") {
        log(colors.green, "✅", "E2E test PASSED!");
      } else {
        log(
          colors.yellow,
          "⚠️",
          `E2E test completed with status: ${finalCall.status}`,
        );
      }
    }
  } catch (error) {
    log(colors.red, "❌", "E2E test FAILED!");
    console.error(error.message);
    process.exit(1);
  }
}

// Run test
main();
