import {
  decideExecutionRetry,
  type ExecutionJobStatus,
  type SideEffectCertainty,
} from "@/lib/execution-job-policy";
import { sanitizeExecutionError } from "@/lib/execution-error-sanitizer";
import { executionRetryAt } from "@/lib/execution-retry-schedule";

export interface ClaimedExecutionJob {
  id: string;
  automationId: string;
  triggerType: "manual" | "scheduled" | "webhook";
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
 * Executor results cannot self-assert provider idempotency: until a reviewed
 * adapter capability is wired into this worker, uncertain effects go to review.
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
      error: error instanceof Error
        ? sanitizeExecutionError(error.message, "Execution failed unexpectedly; verify the external outcome before retrying.")
        : "Worker execution threw an unknown error.",
    };
  }

  if (leaseLost) return { outcome: "lease_lost", jobId: job.id };

  // TypeScript types do not validate provider/adapter values at runtime. Treat
  // malformed executor results as uncertain so an invalid status cannot make
  // a possibly completed external action eligible for automatic retry.
  const validStatuses = new Set(["succeeded", "failed"]);
  const validCertainties = new Set<SideEffectCertainty>([
    "not_attempted",
    "confirmed_no_effect",
    "uncertain",
    "effect_confirmed",
  ]);
  if (
    !result ||
    typeof result !== "object" ||
    !validStatuses.has(result.status) ||
    !validCertainties.has(result.sideEffectCertainty)
  ) {
    result = {
      status: "failed",
      sideEffectCertainty: "uncertain",
      error: "Executor returned an invalid result. Verify the external outcome before retrying.",
    };
  }

  let finalStatus: Exclude<ExecutionJobStatus, "running">;
  // Executor adapters are runtime boundaries: a malformed retry timestamp must
  // not make database finalization fail and leave a job running until lease expiry.
  // Normalize valid timestamps and discard invalid values; safe queued retries get
  // the worker's bounded backoff below when no usable timestamp remains.
  const parsedRetryAt = typeof result.retryAt === "string" ? Date.parse(result.retryAt) : Number.NaN;
  let finalRetryAt = Number.isFinite(parsedRetryAt)
    ? new Date(parsedRetryAt).toISOString()
    : null;
  let error = result.error
    ? sanitizeExecutionError(result.error, "Execution failed; inspect the run details and verify external outcome before retrying.")
    : null;
  if (result.status === "succeeded" && result.sideEffectCertainty === "effect_confirmed") {
    finalStatus = "succeeded";
    error = null;
  } else if (result.status === "succeeded") {
    // A success label without confirmed side-effect evidence is contradictory.
    // Do not publish success or automatically replay a potentially completed action.
    finalStatus = "needs_review";
    error = sanitizeExecutionError(
      result.error,
      "Executor reported success without confirmed side-effect evidence. Verify the external outcome before retrying.",
    );
  } else if (result.retryable === false) {
    // Permanent validation/configuration failures are terminal for this job.
    // Keep them distinct from transient no-side-effect failures that can retry.
    finalStatus = "failed";
  } else {
    const decision = decideExecutionRetry({
      sideEffectCertainty: result.sideEffectCertainty,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      stableIdempotencyKey: job.idempotencyKey,
    });
    finalStatus = decision.status;
    if (finalStatus === "queued" && !finalRetryAt) {
      finalRetryAt = executionRetryAt(job.attempts);
    }
    error = sanitizeExecutionError(
      [error, decision.reason].filter(Boolean).join(" "),
      "Execution failed; inspect the run details and verify external outcome before retrying.",
    );
  }

  let finalized: boolean;
  try {
    finalized = await dependencies.finish(job, finalStatus, error, finalRetryAt);
  } catch {
    // A database/network error means finalization is unknown, not successful.
    return { outcome: "finalization_rejected", jobId: job.id };
  }
  if (!finalized) return { outcome: "finalization_rejected", jobId: job.id };
  return { outcome: "finished", jobId: job.id, status: finalStatus };
}
