import type { Json } from "@/integrations/supabase/types";

export const MAX_EXECUTION_JOB_PAYLOAD_BYTES = 16 * 1024;

export type ExecutionJobPayloadValidation =
  | { success: true; payload: Json }
  | { success: false; error: string };

export interface ValidExecutionJobEnqueueMetadata {
  automationId: string;
  triggerType: "manual" | "scheduled" | "webhook";
  idempotencyKey: string;
  requestedBy?: string | null;
  maxAttempts: number;
  availableAt?: string;
}

export type ExecutionJobEnqueueMetadataValidation =
  | { success: true; value: ValidExecutionJobEnqueueMetadata }
  | { success: false; error: string };

/** Validate runtime values at the server/RPC boundary; TypeScript types do not validate callers. */
export function validateExecutionJobEnqueueMetadata(value: unknown): ExecutionJobEnqueueMetadataValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { success: false, error: "Execution job request must be an object." };
  }
  const input = value as Record<string, unknown>;
  if (typeof input["automationId"] !== "string" || !input["automationId"].trim() || input["automationId"].length > 200) {
    return { success: false, error: "An automation ID is required." };
  }
  if (!["manual", "scheduled", "webhook"].includes(input["triggerType"] as string)) {
    return { success: false, error: "Execution trigger type is unsupported." };
  }
  if (typeof input["idempotencyKey"] !== "string" || !input["idempotencyKey"].trim() || input["idempotencyKey"].length > 200) {
    return { success: false, error: "Idempotency key must contain between 1 and 200 characters." };
  }
  if (input["requestedBy"] !== undefined && input["requestedBy"] !== null && (typeof input["requestedBy"] !== "string" || input["requestedBy"].length > 200)) {
    return { success: false, error: "Requesting user ID must be a string or null." };
  }
  const maxAttempts = input["maxAttempts"] === undefined ? 3 : input["maxAttempts"];
  if (typeof maxAttempts !== "number" || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    return { success: false, error: "Maximum attempts must be an integer from 1 to 10." };
  }
  if (input["availableAt"] !== undefined && (typeof input["availableAt"] !== "string" || input["availableAt"].length > 100 || Number.isNaN(Date.parse(input["availableAt"])))) {
    return { success: false, error: "Available-at timestamp must be a valid date." };
  }
  return {
    success: true,
    value: {
      automationId: input["automationId"],
      triggerType: input["triggerType"] as "manual" | "scheduled" | "webhook",
      idempotencyKey: input["idempotencyKey"],
      ...(input["requestedBy"] !== undefined ? { requestedBy: input["requestedBy"] as string | null } : {}),
      maxAttempts,
      ...(input["availableAt"] !== undefined ? { availableAt: input["availableAt"] as string } : {}),
    },
  };
}

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

export type ExecutionJobEnqueueResult = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "needs_review" | "dead_letter";
};

/** Treat the database RPC result as untrusted data before returning it to callers. */
export function parseExecutionJobEnqueueResult(value: unknown): ExecutionJobEnqueueResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Queue enqueue returned no valid job.");
  }
  const record = value as Record<string, unknown>;
  const validStatuses = ["queued", "running", "succeeded", "failed", "needs_review", "dead_letter"];
  if (
    typeof record["id"] !== "string" ||
    !record["id"].trim() ||
    record["id"].length > 200 ||
    typeof record["status"] !== "string" ||
    !validStatuses.includes(record["status"])
  ) {
    throw new Error("Queue enqueue returned no valid job.");
  }
  return {
    id: record["id"],
    status: record["status"] as ExecutionJobEnqueueResult["status"],
  };
}
