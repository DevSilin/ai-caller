import Fastify from "fastify";
import {vapiRoutes} from "./modules/vapi/vapi.controller";
import {callRoutes} from "./modules/calls/call.controller";
import {config} from "./config";
import {readFileSync, createWriteStream} from "fs";
import {join} from "path";
import {runMigrations, closeDatabase} from "./database/db.service";
import {callService} from "./modules/calls/call.service";
import {vapiService} from "./modules/vapi/vapi.service";
import {Writable} from "stream";

// Setup logging to both console AND file
const logFile = join(process.cwd(), "server.log");
const fileStream = createWriteStream(logFile, {flags: "w"}); // 'w' = overwrite on restart

// Multi-stream: write to both stdout and file
class MultiStream extends Writable {
  _write(
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ) {
    process.stdout.write(chunk, encoding);
    fileStream.write(chunk, encoding);
    callback();
  }
}

const app = Fastify({
  logger: {
    level: "info",
    stream: new MultiStream(),
  },
});

// Initialize database
console.log("🗄️  Initializing database...");
runMigrations();
console.log("✅ Database ready");
console.log(`📝 Server logs: ${logFile}`);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down gracefully...");
  closeDatabase();
  fileStream.end();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Shutting down gracefully...");
  closeDatabase();
  fileStream.end();
  process.exit(0);
});

// Dashboard route
app.get("/dashboard", async (req, reply) => {
  const html = readFileSync(
    join(__dirname, "modules/dashboard/dashboard.html"),
    "utf-8",
  );
  reply.type("text/html").send(html);
});

// Redirect root to dashboard
app.get("/", async (req, reply) => {
  reply.redirect("/dashboard");
});

app.register(vapiRoutes, {prefix: "/webhook/vapi"});
app.register(callRoutes, {prefix: "/calls"});

app
  .listen({
    port: config.port,
    host: "0.0.0.0", // Allow external connections (important for Docker)
  })
  .then(async () => {
    console.log(`🚀 Server running on http://0.0.0.0:${config.port}`);
    console.log(`📝 Environment: ${config.nodeEnv}`);

    // Update Vapi assistant with system prompt and scripts
    try {
      console.log("🤖 Updating Vapi assistant with system prompt...");
      await vapiService.updateAssistant();
      console.log("✅ Vapi assistant configured successfully");
    } catch (error: any) {
      console.error("❌ Failed to update Vapi assistant:", error.message);
      console.error(
        "   Calls may not work correctly without proper assistant configuration",
      );
    }

    // Start periodic cleanup of stale calls (every 5 minutes)
    const STALE_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
    const STALE_TIMEOUT = 10 * 60; // 10 minutes (in seconds)

    setInterval(async () => {
      try {
        const markedCount =
          await callService.markStaleCallsAsFailed(STALE_TIMEOUT);
        if (markedCount > 0) {
          console.log(
            `🧹 Marked ${markedCount} stale call(s) as FAILED (timeout: ${STALE_TIMEOUT}s)`,
          );
        }
      } catch (error) {
        console.error("❌ Error checking for stale calls:", error);
      }
    }, STALE_CHECK_INTERVAL);

    console.log(
      `🧹 Stale call cleanup enabled (check every ${STALE_CHECK_INTERVAL / 1000}s, timeout: ${STALE_TIMEOUT}s)`,
    );
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
