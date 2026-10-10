import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ExecutionJobStatus } from "@/lib/execution-job-policy";
import type {
  ClaimedExecutionJob,
  ExecutionJobWorkerDependencies,
} from "@/lib/execution-job-worker";

type RpcJobRow = {
  id: string;
  automation_id: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
  worker_token: string | null;
  idempotency_key: string;
};

function parseClaimedJob(value: unknown): ClaimedExecutionJob {
  if (!value || typeof value !== "object") {
    throw new Error("Queue claim returned an invalid job row.");
  }
  const row = value as Partial<RpcJobRow>;
  if (
    typeof row.id !== "string" ||
    typeof row.automation_id !== "string" ||
    typeof row.attempts !== "number" ||
    typeof row.max_attempts !== "number" ||
    typeof row.worker_token !== "string" ||
    typeof row.idempotency_key !== "string"
  ) {
    throw new Error("Queue claim row is missing required fields.");
  }
  return {
    id: row.id,
    automationId: row.automation_id,
    payload: row.payload,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    workerToken: row.worker_token,
    idempotencyKey: row.idempotency_key,
  };
}

export interface EnqueueExecutionJobInput {
  automationId: string;
  triggerType: "manual" | "scheduled" | "webhook";
  idempotencyKey: string;
  payload?: Record<string, unknown>;
  requestedBy?: string | null;
  maxAttempts?: number;
  availableAt?: string;
}

/** Server-only enqueue adapter. Duplicate keys return the existing queue row. */
export async function enqueueExecutionJob(input: EnqueueExecutionJobInput): Promise<{ id: string; status: string }> {
  const { data, error } = await supabaseAdmin.rpc("enqueue_execution_job", {
    _automation_id: input.automationId,
    _trigger_type: input.triggerType,
    _idempotency_key: input.idempotencyKey,
    _payload: input.payload ?? {},
    _requested_by: input.requestedBy ?? null,
    _max_attempts: input.maxAttempts ?? 3,
    _available_at: input.availableAt ?? new Date().toISOString(),
  });
  if (error) throw new Error(`Unable to enqueue execution job: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || typeof row !== "object" || !("id" in row) || !("status" in row)) {
    throw new Error("Queue enqueue returned no valid job.");
  }
  return { id: String(row.id), status: String(row.status) };
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
      if (!Array.isArray(data) || data.length === 0) return null;
      return parseClaimedJob(data[0]);
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
