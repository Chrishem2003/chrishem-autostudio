import {
  decideExecutionRetry,
  type ExecutionJobStatus,
  type SideEffectCertainty,
} from "@/lib/execution-job-policy";

export interface ClaimedExecutionJob {
  id: string;
  automationId: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
  workerToken: string;
  idempotencyKey: string;
}

export interface ExecutionJobResult {
  status: "succeeded" | "failed";
  sideEffectCertainty: SideEffectCertainty;
  error?: string | null;
  retryAt?: string | null;
  /** False for permanent validation/configuration failures; do not spin retries. */
  retryable?: boolean;
  providerSupportsIdempotency?: boolean;
}

export interface ExecutionJobWorkerDependencies {
  claim: () => Promise<ClaimedExecutionJob | null>;
  heartbeat: (job: ClaimedExecutionJob) => Promise<boolean>;
  execute: (
    job: ClaimedExecutionJob,
    context: { heartbeat: () => Promise<boolean> },
  ) => Promise<ExecutionJobResult>;
  finish: (
    job: ClaimedExecutionJob,
    status: Exclude<ExecutionJobStatus, "running">,
    error?: string | null,
    retryAt?: string | null,
  ) => Promise<boolean>;
}

export type ProcessOneJobResult =
  | { outcome: "empty" }
  | { outcome: "finished"; jobId: string; status: Exclude<ExecutionJobStatus, "running" | "queued"> | "queued" }
  | { outcome: "lease_lost"; jobId: string }
  | { outcome: "finalization_rejected"; jobId: string };

/**
 * Processes at most one claimed job. Database atomicity and lease fencing are
 * enforced by the RPC adapter; this function never assumes it owns a lease
 * after heartbeat reports false. An exception from an executor is uncertain.
 */
export async function processOneExecutionJob(
  dependencies: ExecutionJobWorkerDependencies,
): Promise<ProcessOneJobResult> {
  const job = await dependencies.claim();
  if (!job) return { outcome: "empty" };

  let leaseLost = false;
  const heartbeat = async (): Promise<boolean> => {
    try {
      const alive = await dependencies.heartbeat(job);
      if (!alive) leaseLost = true;
      return alive;
    } catch {
      // A failed heartbeat is indistinguishable from lost ownership. Fail closed:
      // never finalize based on a lease whose state could not be verified.
      leaseLost = true;
      return false;
    }
  };

  let result: ExecutionJobResult;
  try {
    result = await dependencies.execute(job, { heartbeat });
  } catch (error) {
    if (leaseLost) return { outcome: "lease_lost", jobId: job.id };
    result = {
      status: "failed",
      sideEffectCertainty: "uncertain",
      error: error instanceof Error ? error.message : "Worker execution threw an unknown error.",
    };
  }

  if (leaseLost) return { outcome: "lease_lost", jobId: job.id };

  let finalStatus: Exclude<ExecutionJobStatus, "running">;
  let error = result.error ?? null;
  if (result.status === "succeeded") {
    finalStatus = "succeeded";
    error = null;
  } else if (result.retryable === false) {
    // Permanent validation/configuration failures are terminal for this job.
    // Keep them distinct from transient no-side-effect failures that can retry.
    finalStatus = "failed";
  } else {
    const decision = decideExecutionRetry({
      sideEffectCertainty: result.sideEffectCertainty,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      ...(result.providerSupportsIdempotency === undefined
        ? {}
        : { providerSupportsIdempotency: result.providerSupportsIdempotency }),
      stableIdempotencyKey: job.idempotencyKey,
    });
    finalStatus = decision.status;
    error = [error, decision.reason].filter(Boolean).join(" ").slice(0, 2000);
  }

  let finalized: boolean;
  try {
    finalized = await dependencies.finish(job, finalStatus, error, result.retryAt ?? null);
  } catch {
    // A database/network error means finalization is unknown, not successful.
    return { outcome: "finalization_rejected", jobId: job.id };
  }
  if (!finalized) return { outcome: "finalization_rejected", jobId: job.id };
  return { outcome: "finished", jobId: job.id, status: finalStatus };
}
