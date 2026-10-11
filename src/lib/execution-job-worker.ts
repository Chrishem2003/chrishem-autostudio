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
 * Queue payloads are normalized JSON, but nested objects would otherwise remain
 * mutable when the job envelope is frozen. Freeze the complete payload graph
 * before handing it to an executor so the request being executed cannot drift.
 */
function freezeExecutionPayload(value: unknown, seen = new WeakSet<object>()): unknown {
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    freezeExecutionPayload(child, seen);
  }
  return Object.freeze(value);
}

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
  const claimedJob = await dependencies.claim();
  if (!claimedJob) return { outcome: "empty" };

  // The executor receives the job object. Snapshot and freeze its identity so
  // an adapter cannot mutate the job ID or fencing token before heartbeat or
  // finalization; those RPCs must refer to the exact claim originally returned.
  const job: ClaimedExecutionJob = Object.freeze({
    ...claimedJob,
    payload: freezeExecutionPayload(claimedJob.payload),
  });

  // A successful database claim must have incremented attempts to a positive
  // integer and must respect the database's bounded retry policy. If an adapter
  // returns malformed counters, do not execute external effects or let the
  // retry-policy helper throw after execution has already begun.
  if (
    !Number.isInteger(job.attempts) ||
    job.attempts < 1 ||
    !Number.isInteger(job.maxAttempts) ||
    job.maxAttempts < 1 ||
    job.maxAttempts > 10 ||
    job.attempts > job.maxAttempts
  ) {
    let finalized = false;
    try {
      finalized = (await dependencies.finish(
        job,
        "needs_review",
        "Claimed job retry metadata is invalid. Verify the queue record before retrying.",
        null,
      )) === true;
    } catch {
      // Do not execute when the claim envelope contradicts the queue contract.
    }
    return finalized
      ? { outcome: "finished", jobId: job.id, status: "needs_review" }
      : { outcome: "finalization_rejected", jobId: job.id };
  }

  let leaseLost = false;
  const heartbeat = async (): Promise<boolean> => {
    try {
      const alive = await dependencies.heartbeat(job);
      // A runtime adapter must prove lease ownership with literal true. Truthy
      // objects/strings are malformed responses, not evidence that the lease lives.
      if (alive !== true) {
        leaseLost = true;
        return false;
      }
      return true;
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
    // Rejected values are untrusted at runtime too. Even an Error-shaped object
    // can expose a throwing or non-string message getter; never let diagnostic
    // extraction escape and strand the claimed job outside the worker's policy.
    let thrownMessage: unknown;
    try {
      if (error instanceof Error) thrownMessage = error.message;
    } catch {
      thrownMessage = undefined;
    }
    result = {
      status: "failed",
      sideEffectCertainty: "uncertain",
      error: typeof thrownMessage === "string"
        ? sanitizeExecutionError(thrownMessage, "Execution failed unexpectedly; verify the external outcome before retrying.")
        : "Worker execution threw an unknown error.",
    };
  }

  if (leaseLost) return { outcome: "lease_lost", jobId: job.id };

  // TypeScript types do not validate provider/adapter values at runtime. Treat
  // malformed executor results as uncertain so an invalid status cannot make
  // a possibly completed external action eligible for automatic retry.
  const invalidExecutorResult: ExecutionJobResult = {
    status: "failed",
    sideEffectCertainty: "uncertain",
    error: "Executor returned an invalid result. Verify the external outcome before retrying.",
  };
  const validStatuses = new Set(["succeeded", "failed"]);
  const validCertainties = new Set<SideEffectCertainty>([
    "not_attempted",
    "confirmed_no_effect",
    "uncertain",
    "effect_confirmed",
  ]);
  try {
    if (!result || typeof result !== "object") {
      result = invalidExecutorResult;
    } else {
      // Read adapter fields once and snapshot them: getters/proxies can throw
      // or return different values between accesses at this runtime boundary.
      const candidate = result as unknown as Record<string, unknown>;
      const status = candidate["status"];
      const certainty = candidate["sideEffectCertainty"];
      if (
        !validStatuses.has(status as string) ||
        !validCertainties.has(certainty as SideEffectCertainty)
      ) {
        result = invalidExecutorResult;
      } else {
        const errorValue = candidate["error"];
        const retryAtValue = candidate["retryAt"];
        const retryableValue = candidate["retryable"];
        result = {
          status: status as ExecutionJobResult["status"],
          sideEffectCertainty: certainty as SideEffectCertainty,
          ...(typeof errorValue === "string" || errorValue === null ? { error: errorValue } : {}),
          ...(typeof retryAtValue === "string" || retryAtValue === null ? { retryAt: retryAtValue } : {}),
          ...(typeof retryableValue === "boolean" ? { retryable: retryableValue } : {}),
        };
      }
    }
  } catch {
    // A malformed adapter result is an uncertain external outcome.
    result = invalidExecutorResult;
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
  } else if (
    result.retryable === false &&
    (result.sideEffectCertainty === "not_attempted" || result.sideEffectCertainty === "confirmed_no_effect")
  ) {
    // Permanent validation/configuration failures are terminal only when the
    // adapter confirms no effect. Uncertain/confirmed effects must remain reviewable.
    finalStatus = "failed";
  } else {
    const decision = decideExecutionRetry({
      sideEffectCertainty: result.sideEffectCertainty,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
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

  // Retry scheduling is meaningful only for a queued job. Never pass an
  // executor-supplied retry timestamp to terminal/manual-review finalization.
  if (finalStatus !== "queued") finalRetryAt = null;

  let finalized: boolean;
  try {
    // RPC adapters are expected to return a boolean, but enforce the contract
    // here too: only literal true confirms durable finalization.
    finalized = (await dependencies.finish(job, finalStatus, error, finalRetryAt)) === true;
  } catch {
    // A database/network error means finalization is unknown, not successful.
    return { outcome: "finalization_rejected", jobId: job.id };
  }
  if (!finalized) return { outcome: "finalization_rejected", jobId: job.id };
  return { outcome: "finished", jobId: job.id, status: finalStatus };
}
