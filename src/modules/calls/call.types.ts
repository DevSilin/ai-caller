export type CallState = "GREETING" | "QUALIFICATION" | "CLOSING" | "END";

export type CallStatus =
  | "PENDING"
  | "CALLING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "NO_ANSWER"
  | "VOICEMAIL";

export interface LeadData {
  firstName: string;
  lastName: string;
  phone: string;
  county: string;
  state: string;
  acreage?: number;
  propertyAddress?: string;
}

export interface CallSummary {
  duration: number;
  outcome: string;
  interestLevel: "HOT" | "WARM" | "COLD" | "NOT_INTERESTED";
  keyPoints: string[];
  nextAction?: string;
  appointmentScheduled?: boolean;
}

/**
 * Structured transcript message with role, text, and timestamp
 */
export interface TranscriptMessage {
  role: "user" | "bot" | "system";
  message: string;
  time?: number; // Unix timestamp in milliseconds
  secondsFromStart?: number; // Seconds from call start (from Vapi)
}

export interface CallEntity {
  id: string;
  phone: string;
  state: CallState;
  status: CallStatus;
  transcript: TranscriptMessage[]; // Changed from string[] to structured messages
  outcome?: string;
  leadData?: LeadData;
  summary?: CallSummary;
  vapiCallId?: string;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
