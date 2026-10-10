import type { Json } from "@/integrations/supabase/types";

export const MAX_EXECUTION_JOB_PAYLOAD_BYTES = 16 * 1024;

export type ExecutionJobPayloadValidation =
  | { success: true; payload: Json }
  | { success: false; error: string };

/**
 * Queue payloads are durable database records. Keep them bounded and object-shaped
 * so a caller cannot turn a tiny trigger into an unbounded storage/worker burden.
 */
export function validateExecutionJobPayload(value: unknown): ExecutionJobPayloadValidation {
  if (value === undefined) return { success: true, payload: {} };
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { success: false, error: "Execution job payload must be a JSON object." };
  }

  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { success: false, error: "Execution job payload must be valid JSON." };
  }
  if (typeof serialized !== "string") {
    return { success: false, error: "Execution job payload must be valid JSON." };
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_EXECUTION_JOB_PAYLOAD_BYTES) {
    return { success: false, error: "Execution job payload exceeds the 16 KiB limit." };
  }

  try {
    return { success: true, payload: JSON.parse(serialized) as Json };
  } catch {
    return { success: false, error: "Execution job payload must be valid JSON." };
  }
}
