import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { parseExecutionJobEnqueueResult, validateExecutionJobEnqueueMetadata, validateExecutionJobPayload } from "@/lib/execution-job-input";
import { parseClaimedExecutionJobResponse } from "@/lib/execution-job-claim";
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
export async function enqueueExecutionJob(input: EnqueueExecutionJobInput): Promise<{ id: string; status: "queued" | "running" | "succeeded" | "failed" | "needs_review" | "dead_letter" }> {
  const metadata = validateExecutionJobEnqueueMetadata(input);
  if (!metadata.success) throw new Error(metadata.error);
  const { automationId, triggerType, idempotencyKey, requestedBy, maxAttempts, availableAt } = metadata.value;
  const payloadValidation = validateExecutionJobPayload(input.payload);
  if (!payloadValidation.success) throw new Error(payloadValidation.error);
  const payload = payloadValidation.payload;
  const { data, error } = await supabaseAdmin.rpc("enqueue_execution_job", {
    _automation_id: automationId,
    _trigger_type: triggerType,
    _idempotency_key: idempotencyKey,
    _payload: payload,
    _requested_by: requestedBy ?? null,
    _max_attempts: maxAttempts,
    _available_at: availableAt ?? new Date().toISOString(),
  });
  if (error) throw new Error("Unable to enqueue execution job.");
  const row = Array.isArray(data) ? data[0] : null;
  return parseExecutionJobEnqueueResult(row);
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
      if (error) throw new Error("Unable to claim execution job.");
      return parseClaimedExecutionJobResponse(data);
    },
    heartbeat: async (job) => {
      const { data, error } = await supabaseAdmin.rpc("heartbeat_execution_job", {
        _job_id: job.id,
        _worker_token: job.workerToken,
        _lease_seconds: 300,
      });
      if (error) throw new Error("Unable to renew execution lease.");
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
      if (error) throw new Error("Unable to finalize execution job.");
      return data === true;
    },
  };
}
