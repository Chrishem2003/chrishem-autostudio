export const EXECUTION_JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "needs_review",
  "dead_letter",
] as const;

export type ExecutionJobStatus = (typeof EXECUTION_JOB_STATUSES)[number];
export type SideEffectCertainty =
  | "not_attempted"
  | "confirmed_no_effect"
  | "uncertain"
  | "effect_confirmed";

export interface RetryPolicyInput {
  sideEffectCertainty: SideEffectCertainty;
  attempts: number;
  maxAttempts: number;
  providerSupportsIdempotency?: boolean;
  stableIdempotencyKey?: string | null;
}

export type RetryDecision =
  | { status: "queued"; retryAllowed: true; reason: string }
  | { status: "dead_letter"; retryAllowed: false; reason: string }
  | { status: "needs_review"; retryAllowed: false; reason: string };

/**
 * Pure guard for worker retry decisions. Callers must not treat a timeout as
 * proof that an action did not happen. Provider idempotency is accepted only
 * when the provider contract is verified and the same stable key is reused.
 */
export function decideExecutionRetry(input: RetryPolicyInput): RetryDecision {
  if (!Number.isInteger(input.attempts) || input.attempts < 1) {
    throw new Error("attempts must be a positive integer");
  }
  if (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 10) {
    throw new Error("maxAttempts must be an integer between 1 and 10");
  }
  if (input.attempts > input.maxAttempts) {
    throw new Error("attempts cannot exceed maxAttempts");
  }

  if (input.sideEffectCertainty === "uncertain") {
    const idempotencyVerified =
      input.providerSupportsIdempotency === true &&
      typeof input.stableIdempotencyKey === "string" &&
      input.stableIdempotencyKey.trim().length > 0;
    if (!idempotencyVerified) {
      return {
        status: "needs_review",
        retryAllowed: false,
        reason: "The side effect may already have occurred; verify it before retrying.",
      };
    }
  } else if (input.sideEffectCertainty === "effect_confirmed") {
    return {
      status: "needs_review",
      retryAllowed: false,
      reason: "The side effect is confirmed; do not repeat it as a retry.",
    };
  }

  if (input.attempts >= input.maxAttempts) {
    return {
      status: "dead_letter",
      retryAllowed: false,
      reason: "The configured attempt limit has been reached.",
    };
  }

  return {
    status: "queued",
    retryAllowed: true,
    reason:
      input.sideEffectCertainty === "uncertain"
        ? "Retry is permitted only under the verified provider idempotency contract."
        : "No external side effect occurred, so retry is safe.",
  };
}
