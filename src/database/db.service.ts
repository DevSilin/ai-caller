import Database from "better-sqlite3";
import path from "path";
import { config } from "../config";

let db: Database.Database | null = null;

/**
 * Initialize and return the SQLite database connection
 */
export function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = path.resolve(config.databasePath);
    db = new Database(dbPath);

    // Enable foreign keys and WAL mode for better performance
    db.pragma("foreign_keys = ON");
    db.pragma("journal_mode = WAL");

    console.log(`Database initialized at: ${dbPath}`);
  }

  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Execute database migrations
 */
export function runMigrations(): void {
  const database = getDatabase();

  // Create calls table
  database.exec(`
    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY,
      vapi_call_id TEXT UNIQUE,
      lead_first_name TEXT NOT NULL,
      lead_last_name TEXT NOT NULL,
      lead_phone TEXT NOT NULL,
      lead_county TEXT NOT NULL,
      lead_state TEXT NOT NULL,
      lead_acreage REAL,
      lead_property_address TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      current_state TEXT NOT NULL DEFAULT 'GREETING',
      transcript TEXT NOT NULL DEFAULT '[]',
      summary TEXT,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      started_at INTEGER,
      ended_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_calls_vapi_call_id ON calls(vapi_call_id);
    CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
    CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at);
  `);

  // Migration: Add error_message column if it doesn't exist (for existing databases)
  try {
    database.exec(`ALTER TABLE calls ADD COLUMN error_message TEXT`);
    console.log("Migration: Added error_message column to calls table");
  } catch (error: any) {
    // Column already exists or other error - safe to ignore
    if (!error.message.includes("duplicate column name")) {
      console.warn("Migration warning:", error.message);
    }
  }

  // Migration: Convert old transcript format (string[]) to new format (TranscriptMessage[])
  // Old format: ["text1", "text2", "text3"]
  // New format: [{role: "user", message: "text1"}, {role: "user", message: "text2"}]
  try {
    const rows = database.prepare("SELECT id, transcript FROM calls").all() as Array<{
      id: string;
      transcript: string;
    }>;
    let migratedCount = 0;

    for (const row of rows) {
      try {
        const transcript = JSON.parse(row.transcript);

        // Check if transcript is in old format (array of strings)
        if (Array.isArray(transcript) && transcript.length > 0) {
          const firstItem = transcript[0];

          // Old format: string
          // New format: object with role and message
          if (typeof firstItem === "string") {
            // Convert to new format
            const newTranscript = transcript.map((text: string) => ({
              role: "user", // Old transcripts only stored user messages
              message: text,
            }));

            // Update the database
            database
              .prepare("UPDATE calls SET transcript = ? WHERE id = ?")
              .run(JSON.stringify(newTranscript), row.id);

            migratedCount++;
          }
        }
      } catch (err) {
        // Skip rows with invalid JSON or other issues
        console.warn(`Failed to migrate transcript for call ${row.id}:`, err);
      }
    }

    if (migratedCount > 0) {
      console.log(
        `Migration: Converted ${migratedCount} transcript(s) to new structured format`,
      );
    }
  } catch (error: any) {
    console.warn("Migration warning (transcript format):", error.message);
  }

  console.log("Database migrations completed successfully");
}
