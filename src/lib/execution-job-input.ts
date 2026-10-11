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

  // Snapshot adapter/caller fields once. Getters and proxies are runtime input
  // too; a thrown or changing accessor must not alter the validated RPC payload.
  let automationId: unknown;
  let triggerType: unknown;
  let idempotencyKey: unknown;
  let requestedBy: unknown;
  let maxAttemptsInput: unknown;
  let availableAt: unknown;
  try {
    const input = value as Record<string, unknown>;
    automationId = input["automationId"];
    triggerType = input["triggerType"];
    idempotencyKey = input["idempotencyKey"];
    requestedBy = input["requestedBy"];
    maxAttemptsInput = input["maxAttempts"];
    availableAt = input["availableAt"];
  } catch {
    return { success: false, error: "Execution job request contains invalid fields." };
  }

  if (typeof automationId !== "string" || !automationId.trim() || automationId.length > 200) {
    return { success: false, error: "An automation ID is required." };
  }
  const normalizedAutomationId = automationId.trim();
  if (!["manual", "scheduled", "webhook"].includes(triggerType as string)) {
    return { success: false, error: "Execution trigger type is unsupported." };
  }
  if (typeof idempotencyKey !== "string" || !idempotencyKey.trim() || idempotencyKey.length > 200) {
    return { success: false, error: "Idempotency key must contain between 1 and 200 characters." };
  }
  const normalizedIdempotencyKey = idempotencyKey.trim();
  if (requestedBy !== undefined && requestedBy !== null && (typeof requestedBy !== "string" || requestedBy.length > 200)) {
    return { success: false, error: "Requesting user ID must be a string or null." };
  }
  const maxAttempts = maxAttemptsInput === undefined ? 3 : maxAttemptsInput;
  if (typeof maxAttempts !== "number" || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    return { success: false, error: "Maximum attempts must be an integer from 1 to 10." };
  }
  if (availableAt !== undefined && (typeof availableAt !== "string" || availableAt.length > 100 || Number.isNaN(Date.parse(availableAt)))) {
    return { success: false, error: "Available-at timestamp must be a valid date." };
  }
  return {
    success: true,
    value: {
      automationId: normalizedAutomationId,
      triggerType: triggerType as "manual" | "scheduled" | "webhook",
      idempotencyKey: normalizedIdempotencyKey,
      ...(requestedBy !== undefined ? { requestedBy: requestedBy as string | null } : {}),
      maxAttempts,
      ...(availableAt !== undefined ? { availableAt: availableAt as string } : {}),
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
    const normalized: unknown = JSON.parse(serialized);
    if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
      return { success: false, error: "Execution job payload must be a JSON object." };
    }
    return { success: true, payload: normalized as Json };
  } catch {
    return { success: false, error: "Execution job payload must be valid JSON." };
  }
}

/**
 * Read and validate the payload field at the enqueue boundary. Accessing the
 * field itself can throw before JSON serialization gets a chance to validate it.
 */
export function validateExecutionJobRequestPayload(request: unknown): ExecutionJobPayloadValidation {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return { success: false, error: "Execution job request must be an object." };
  }
  let payload: unknown;
  try {
    payload = (request as Record<string, unknown>)["payload"];
  } catch {
    return { success: false, error: "Execution job payload must be valid JSON." };
  }
  return validateExecutionJobPayload(payload);
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
  let id: unknown;
  let status: unknown;
  try {
    const record = value as Record<string, unknown>;
    id = record["id"];
    status = record["status"];
  } catch {
    throw new Error("Queue enqueue returned no valid job.");
  }

  const validStatuses = ["queued", "running", "succeeded", "failed", "needs_review", "dead_letter"];
  if (
    typeof id !== "string" ||
    !id.trim() ||
    id.length > 200 ||
    typeof status !== "string" ||
    !validStatuses.includes(status)
  ) {
    throw new Error("Queue enqueue returned no valid job.");
  }
  return {
    id,
    status: status as ExecutionJobEnqueueResult["status"],
  };
}
