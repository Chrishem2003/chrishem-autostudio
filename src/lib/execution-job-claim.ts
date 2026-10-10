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

  const row = value as ClaimedJobRow;
  if (
    typeof row.id !== "string" || row.id.trim().length === 0 ||
    typeof row.automation_id !== "string" || row.automation_id.trim().length === 0 ||
    typeof row.trigger_type !== "string" || !["manual", "scheduled", "webhook"].includes(row.trigger_type) ||
    typeof row.worker_token !== "string" || row.worker_token.trim().length === 0 ||
    typeof row.idempotency_key !== "string" ||
    row.idempotency_key.trim().length === 0 || row.idempotency_key.length > 200
  ) {
    throw new Error("Queue claim row is missing required fields.");
  }

  if (
    typeof row.max_attempts !== "number" || !Number.isInteger(row.max_attempts) || row.max_attempts < 1 ||
    row.max_attempts > 10 ||
    typeof row.attempts !== "number" || !Number.isInteger(row.attempts) || row.attempts < 1 ||
    row.attempts > row.max_attempts
  ) {
    throw new Error("Queue claim row has invalid attempt counters.");
  }

  if (!Object.prototype.hasOwnProperty.call(row, "payload") || row.payload === undefined) {
    throw new Error("Queue claim row has an invalid payload.");
  }

  const payloadValidation = validateExecutionJobPayload(row.payload);
  if (!payloadValidation.success) {
    throw new Error("Queue claim row has an invalid payload.");
  }

  return {
    id: row.id,
    automationId: row.automation_id,
    triggerType: row.trigger_type as "manual" | "scheduled" | "webhook",
    payload: payloadValidation.payload,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    workerToken: row.worker_token,
    idempotencyKey: row.idempotency_key,
  };
}
