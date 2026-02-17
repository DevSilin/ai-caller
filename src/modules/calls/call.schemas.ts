import {z} from "zod";

/**
 * Phone number validation (E.164 format or US format)
 */
const phoneSchema = z
  .string()
  .min(10, "Phone number must be at least 10 digits")
  .max(15, "Phone number must be at most 15 digits")
  .regex(
    /^\+?[1-9]\d{1,14}$/,
    "Phone number must be in valid format (E.164 or US format)",
  );

/**
 * Lead data schema for creating a call
 */
export const leadDataSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  phone: phoneSchema,
  county: z.string().min(1, "County is required").max(100),
  state: z.string().min(2, "State is required").max(2),
  acreage: z.number().positive().optional(),
  propertyAddress: z.string().max(500).optional(),
});

export type LeadDataInput = z.infer<typeof leadDataSchema>;

/**
 * Query params for listing calls
 */
export const getCallsQuerySchema = z.object({
  status: z
    .enum([
      "PENDING",
      "CALLING",
      "IN_PROGRESS",
      "COMPLETED",
      "FAILED",
      "NO_ANSWER",
      "VOICEMAIL",
    ])
    .optional(),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().min(1).max(100))
    .optional(),
});

/**
 * URL params for call ID
 */
export const callIdParamsSchema = z.object({
  id: z.string().uuid("Invalid call ID format"),
});
