import {randomUUID} from "crypto";
import {CallEntity, LeadData, CallSummary} from "./call.types";
import {getDatabase} from "../../database/db.service";

/**
 * Convert database row to CallEntity
 */
function rowToCall(row: any): CallEntity {
  return {
    id: row.id,
    vapiCallId: row.vapi_call_id || undefined,
    phone: row.lead_phone,
    state: row.current_state,
    status: row.status,
    transcript: JSON.parse(row.transcript),
    leadData: {
      firstName: row.lead_first_name,
      lastName: row.lead_last_name,
      phone: row.lead_phone,
      county: row.lead_county,
      state: row.lead_state,
      acreage: row.lead_acreage || undefined,
      propertyAddress: row.lead_property_address || undefined,
    },
    summary: row.summary ? JSON.parse(row.summary) : undefined,
    errorMessage: row.error_message || undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    startedAt: row.started_at ? new Date(row.started_at) : undefined,
    completedAt: row.ended_at ? new Date(row.ended_at) : undefined,
  };
}

/**
 * Convert CallEntity to database values
 */
function callToRow(call: CallEntity) {
  return {
    id: call.id,
    vapi_call_id: call.vapiCallId || null,
    lead_first_name: call.leadData?.firstName || "Unknown",
    lead_last_name: call.leadData?.lastName || "",
    lead_phone: call.phone,
    lead_county: call.leadData?.county || "Unknown",
    lead_state: call.leadData?.state || "Unknown",
    lead_acreage: call.leadData?.acreage || null,
    lead_property_address: call.leadData?.propertyAddress || null,
    status: call.status,
    current_state: call.state,
    transcript: JSON.stringify(call.transcript),
    summary: call.summary ? JSON.stringify(call.summary) : null,
    error_message: call.errorMessage || null,
    created_at: call.createdAt.getTime(),
    updated_at: call.updatedAt.getTime(),
    started_at: call.startedAt ? call.startedAt.getTime() : null,
    ended_at: call.completedAt ? call.completedAt.getTime() : null,
  };
}

export const callService = {
  async create(phone: string, leadData?: LeadData): Promise<CallEntity> {
    const db = getDatabase();
    const now = new Date();
    const call: CallEntity = {
      id: randomUUID(),
      phone,
      state: "GREETING",
      status: "PENDING",
      transcript: [],
      leadData,
      createdAt: now,
      updatedAt: now,
    };

    const row = callToRow(call);
    const stmt = db.prepare(`
      INSERT INTO calls (
        id, vapi_call_id, lead_first_name, lead_last_name, lead_phone,
        lead_county, lead_state, lead_acreage, lead_property_address,
        status, current_state, transcript, summary, error_message,
        created_at, updated_at, started_at, ended_at
      ) VALUES (
        @id, @vapi_call_id, @lead_first_name, @lead_last_name, @lead_phone,
        @lead_county, @lead_state, @lead_acreage, @lead_property_address,
        @status, @current_state, @transcript, @summary, @error_message,
        @created_at, @updated_at, @started_at, @ended_at
      )
    `);

    stmt.run(row);
    return call;
  },

  async get(id: string): Promise<CallEntity | undefined> {
    const db = getDatabase();
    const stmt = db.prepare("SELECT * FROM calls WHERE id = ?");
    const row = stmt.get(id);
    return row ? rowToCall(row) : undefined;
  },

  async getByVapiCallId(vapiCallId: string): Promise<CallEntity | undefined> {
    const db = getDatabase();
    const stmt = db.prepare("SELECT * FROM calls WHERE vapi_call_id = ?");
    const row = stmt.get(vapiCallId);
    return row ? rowToCall(row) : undefined;
  },

  async save(call: CallEntity): Promise<void> {
    const db = getDatabase();
    call.updatedAt = new Date();
    const row = callToRow(call);

    const stmt = db.prepare(`
      UPDATE calls SET
        vapi_call_id = @vapi_call_id,
        lead_first_name = @lead_first_name,
        lead_last_name = @lead_last_name,
        lead_phone = @lead_phone,
        lead_county = @lead_county,
        lead_state = @lead_state,
        lead_acreage = @lead_acreage,
        lead_property_address = @lead_property_address,
        status = @status,
        current_state = @current_state,
        transcript = @transcript,
        summary = @summary,
        error_message = @error_message,
        updated_at = @updated_at,
        started_at = @started_at,
        ended_at = @ended_at
      WHERE id = @id
    `);

    stmt.run(row);
  },

  async updateStatus(
    id: string,
    status: CallEntity["status"],
    errorMessage?: string,
  ): Promise<void> {
    const call = await this.get(id);
    if (!call) return;

    call.status = status;
    call.updatedAt = new Date();
    if (status === "IN_PROGRESS" && !call.startedAt) {
      call.startedAt = new Date();
    }
    if ((status === "COMPLETED" || status === "FAILED") && !call.completedAt) {
      call.completedAt = new Date();
      // When call ends (completed or failed), set state to END
      call.state = "END";
    }
    // Set error message for failed calls
    if (status === "FAILED" && errorMessage) {
      call.errorMessage = errorMessage;
    }
    await this.save(call);
  },

  async updateState(id: string, state: CallEntity["state"]): Promise<void> {
    const call = await this.get(id);
    if (call) {
      call.state = state;
      call.updatedAt = new Date();
      await this.save(call);
    }
  },

  async addSummary(id: string, summary: CallSummary): Promise<void> {
    const call = await this.get(id);
    if (call) {
      call.summary = summary;
      call.updatedAt = new Date();
      await this.save(call);
    }
  },

  async getAll(): Promise<CallEntity[]> {
    const db = getDatabase();
    const stmt = db.prepare("SELECT * FROM calls ORDER BY created_at DESC");
    const rows = stmt.all();
    return rows.map(rowToCall);
  },

  async getRecent(limit: number = 50): Promise<CallEntity[]> {
    const db = getDatabase();
    const stmt = db.prepare(
      "SELECT * FROM calls ORDER BY created_at DESC LIMIT ?",
    );
    const rows = stmt.all(limit);
    return rows.map(rowToCall);
  },

  async getByStatus(status: CallEntity["status"]): Promise<CallEntity[]> {
    const db = getDatabase();
    const stmt = db.prepare("SELECT * FROM calls WHERE status = ?");
    const rows = stmt.all(status);
    return rows.map(rowToCall);
  },

  /**
   * Mark stale calls as FAILED
   * Calls are considered stale if they're in CALLING or IN_PROGRESS status
   * for more than the specified timeout (in seconds)
   */
  async markStaleCallsAsFailed(timeoutSeconds: number = 600): Promise<number> {
    const db = getDatabase();
    const cutoffTime = Date.now() - timeoutSeconds * 1000;

    // Find stale calls (CALLING or IN_PROGRESS for too long)
    const stmt = db.prepare(`
      SELECT * FROM calls
      WHERE (status = 'CALLING' OR status = 'IN_PROGRESS')
      AND updated_at < ?
    `);

    const staleRows = stmt.all(cutoffTime);
    const staleCalls = staleRows.map(rowToCall);

    // Mark each as FAILED and generate summary
    for (const call of staleCalls) {
      const timeoutMinutes = Math.floor(timeoutSeconds / 60);
      await this.updateStatus(
        call.id,
        "FAILED",
        `Call timed out after ${timeoutMinutes} minutes without status update`,
      );
      // state will be automatically set to "END" by updateStatus

      // Generate summary if there's transcript and no existing summary
      if (call.transcript.length > 0 && !call.summary) {
        const summary = this.generateBasicSummary(call);
        await this.addSummary(call.id, summary);
      }
    }

    return staleCalls.length;
  },

  /**
   * Generate basic summary for calls without webhook data
   * Used for stale calls and fallback scenarios
   */
  generateBasicSummary(call: CallEntity): CallSummary {
    const transcriptText = call.transcript.map((t) => t.message).join(" ");
    const lower = transcriptText.toLowerCase();

    // Analyze interest level
    let interestLevel: "HOT" | "WARM" | "COLD" | "NOT_INTERESTED" = "COLD";
    if (
      lower.includes("yes") ||
      lower.includes("interested") ||
      lower.includes("how much")
    ) {
      interestLevel = "HOT";
    } else if (
      lower.includes("not interested") ||
      lower.includes("no thanks")
    ) {
      interestLevel = "NOT_INTERESTED";
    } else if (lower.includes("maybe") || lower.includes("thinking about")) {
      interestLevel = "WARM";
    }

    // Extract key points
    const keyPoints: string[] = [];
    if (call.leadData) {
      keyPoints.push(
        `Property: ${call.leadData.acreage || "?"} acres in ${call.leadData.county} County, ${call.leadData.state}`,
      );
    }
    if (call.transcript.length > 0) {
      keyPoints.push(`Conversation length: ${call.transcript.length} messages`);
    }
    if (call.status === "FAILED") {
      keyPoints.push("Call timed out or failed");
    }

    // Calculate duration if possible
    let duration = 0;
    if (call.startedAt && call.completedAt) {
      duration = Math.floor(
        (new Date(call.completedAt).getTime() -
          new Date(call.startedAt).getTime()) /
          1000,
      );
    }

    // Determine outcome
    let outcome = "Call completed";
    if (call.status === "FAILED") {
      outcome = "Call failed or timed out";
    } else if (interestLevel === "HOT") {
      outcome = "Lead qualified - needs offer";
    } else if (interestLevel === "NOT_INTERESTED") {
      outcome = "Lead not interested";
    }

    // Determine next action
    let nextAction = "Review transcript";
    if (call.status === "FAILED") {
      nextAction = "Retry call later";
    } else if (interestLevel === "HOT") {
      nextAction = "Send offer via email";
    } else if (interestLevel === "NOT_INTERESTED") {
      nextAction = "Mark as do not contact";
    }

    return {
      duration,
      outcome,
      interestLevel,
      keyPoints,
      nextAction,
      appointmentScheduled: false,
    };
  },
};
