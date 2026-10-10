import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { validateExecutionJobPayload } from "@/lib/execution-job-input";
import { parseClaimedExecutionJob } from "@/lib/execution-job-claim";
import type { ExecutionJobStatus } from "@/lib/execution-job-policy";
import type {
  ClaimedExecutionJob,
  ExecutionJobWorkerDependencies,
} from "@/lib/execution-job-worker";


export interface EnqueueExecutionJobInput {
  automationId: string;
  triggerType: "manual" | "scheduled" | "webhook";
  idempotencyKey: string;
  payload?: Json;
  requestedBy?: string | null;
  maxAttempts?: number;
  availableAt?: string;
}

/** Server-only enqueue adapter. Duplicate keys return the existing queue row. */
export async function enqueueExecutionJob(input: EnqueueExecutionJobInput): Promise<{ id: string; status: string }> {
  const automationId = input.automationId.trim();
  if (!automationId) throw new Error("An automation ID is required.");
  if (!["manual", "scheduled", "webhook"].includes(input.triggerType)) {
    throw new Error("Unsupported execution trigger.");
  }
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey || idempotencyKey.length > 200) {
    throw new Error("Idempotency key must contain between 1 and 200 non-whitespace characters.");
  }
  const payloadValidation = validateExecutionJobPayload(input.payload);
  if (!payloadValidation.success) throw new Error(payloadValidation.error);
  const payload = payloadValidation.payload;
  const maxAttempts = input.maxAttempts ?? 3;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    throw new Error("Maximum attempts must be an integer from 1 to 10.");
  }
  if (input.availableAt && Number.isNaN(Date.parse(input.availableAt))) {
    throw new Error("Available-at timestamp must be a valid date.");
  }
  const { data, error } = await supabaseAdmin.rpc("enqueue_execution_job", {
    _automation_id: automationId,
    _trigger_type: input.triggerType,
    _idempotency_key: idempotencyKey,
    _payload: payload,
    _requested_by: input.requestedBy ?? null,
    _max_attempts: maxAttempts,
    _available_at: input.availableAt ?? new Date().toISOString(),
  });
  if (error) throw new Error(`Unable to enqueue execution job: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error("Queue enqueue returned no valid job.");
  }
  const record = row as Record<string, unknown>;
  if (typeof record["id"] !== "string" || typeof record["status"] !== "string") {
    throw new Error("Queue enqueue returned no valid job.");
  }
  return { id: record["id"], status: record["status"] };
}

/**
 * Builds transport dependencies for the tested worker. The service-role client
 * must stay inside server-only modules; never import this module into browser code.
 */
export function createSupabaseExecutionJobDependencies(
  execute: ExecutionJobWorkerDependencies["execute"],
): ExecutionJobWorkerDependencies {
  return {
    claim: async () => {
      const { data, error } = await supabaseAdmin.rpc("claim_execution_job", {
        _lease_seconds: 300,
      });
      if (error) throw new Error(`Unable to claim execution job: ${error.message}`);
      if (data === null) return null;
      if (!Array.isArray(data)) throw new Error("Queue claim returned an unexpected response.");
      if (data.length === 0) return null;
      return parseClaimedExecutionJob(data[0]);
    },
    heartbeat: async (job) => {
      const { data, error } = await supabaseAdmin.rpc("heartbeat_execution_job", {
        _job_id: job.id,
        _worker_token: job.workerToken,
        _lease_seconds: 300,
      });
      if (error) throw new Error(`Unable to renew execution lease: ${error.message}`);
      return data === true;
    },
    execute,
    finish: async (job, status, errorMessage, retryAt) => {
      const allowedStatus: Exclude<ExecutionJobStatus, "running"> = status;
      const { data, error } = await supabaseAdmin.rpc("finish_execution_job", {
        _job_id: job.id,
        _worker_token: job.workerToken,
        _status: allowedStatus,
        _error: errorMessage ?? null,
        _retry_at: retryAt ?? null,
      });
      if (error) throw new Error(`Unable to finalize execution job: ${error.message}`);
      return data === true;
    },
  };
}
