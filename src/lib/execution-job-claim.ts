import { validateExecutionJobPayload } from "@/lib/execution-job-input";
import type { ClaimedExecutionJob } from "@/lib/execution-job-worker";

type ClaimedJobRow = {
  id: unknown;
  automation_id: unknown;
  trigger_type: unknown;
  payload: unknown;
  attempts: unknown;
  max_attempts: unknown;
  worker_token: unknown;
  idempotency_key: unknown;
};

/**
 * Treat the database/RPC response as untrusted input. A malformed claim must
 * never reach the executor, where it could trigger an external side effect.
 */
export function parseClaimedExecutionJob(value: unknown): ClaimedExecutionJob {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Queue claim returned an invalid job row.");
  }

  let id: unknown;
  let automationId: unknown;
  let triggerType: unknown;
  let payload: unknown;
  let attempts: unknown;
  let maxAttempts: unknown;
  let workerToken: unknown;
  let idempotencyKey: unknown;
  try {
    const row = value as ClaimedJobRow;
    id = row.id;
    automationId = row.automation_id;
    triggerType = row.trigger_type;
    payload = row.payload;
    attempts = row.attempts;
    maxAttempts = row.max_attempts;
    workerToken = row.worker_token;
    idempotencyKey = row.idempotency_key;
  } catch {
    throw new Error("Queue claim row contains invalid fields.");
  }

  if (
    typeof id !== "string" || id.trim().length === 0 || id.length > 200 ||
    typeof automationId !== "string" || automationId.trim().length === 0 || automationId.length > 200 ||
    !["manual", "scheduled", "webhook"].includes(triggerType as string) ||
    typeof workerToken !== "string" || workerToken.trim().length === 0 || workerToken.length > 200 ||
    typeof idempotencyKey !== "string" ||
    idempotencyKey.trim().length === 0 || idempotencyKey.length > 200
  ) {
    throw new Error("Queue claim row is missing required fields.");
  }

  if (
    typeof maxAttempts !== "number" || !Number.isInteger(maxAttempts) || maxAttempts < 1 ||
    maxAttempts > 10 ||
    typeof attempts !== "number" || !Number.isInteger(attempts) || attempts < 1 ||
    attempts > maxAttempts
  ) {
    throw new Error("Queue claim row has invalid attempt counters.");
  }

  const payloadValidation = validateExecutionJobPayload(payload);
  if (!payloadValidation.success) {
    throw new Error("Queue claim row has an invalid payload.");
  }

  return {
    id,
    automationId,
    triggerType: triggerType as "manual" | "scheduled" | "webhook",
    payload: payloadValidation.payload,
    attempts,
    maxAttempts,
    workerToken,
    idempotencyKey,
  };
}

/**
 * Validate the claim RPC envelope before allowing any returned job to execute.
 * The database contract is zero or one row; multiple rows are a protocol error.
 */
export function parseClaimedExecutionJobResponse(value: unknown): ClaimedExecutionJob | null {
  if (value === null) return null;
  if (!Array.isArray(value)) {
    throw new Error("Queue claim returned an unexpected response.");
  }
  if (value.length === 0) return null;
  if (value.length !== 1) {
    throw new Error("Queue claim returned multiple job rows.");
  }
  return parseClaimedExecutionJob(value[0]);
}
