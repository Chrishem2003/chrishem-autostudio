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
}

export type RetryDecision =
  | { status: "queued"; retryAllowed: true; reason: string }
  | { status: "dead_letter"; retryAllowed: false; reason: string }
  | { status: "needs_review"; retryAllowed: false; reason: string };

/**
 * Pure guard for worker retry decisions. Callers must not treat a timeout as
 * proof that an action did not happen. Uncertain outcomes always require
 * manual review until a trusted, reviewed adapter capability is explicitly
 * integrated into this policy; caller-provided claims are not sufficient.
 */
export function decideExecutionRetry(input: RetryPolicyInput): RetryDecision {
  if (!input || typeof input !== "object" || ![
    "not_attempted",
    "confirmed_no_effect",
    "uncertain",
    "effect_confirmed",
  ].includes(input.sideEffectCertainty)) {
    return {
      status: "needs_review",
      retryAllowed: false,
      reason: "Side-effect certainty is invalid; verify the external outcome before retrying.",
    };
  }
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
    return {
      status: "needs_review",
      retryAllowed: false,
      reason: "The side effect may already have occurred; verify it before retrying.",
    };
  }
  if (input.sideEffectCertainty === "effect_confirmed") {
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
    reason: "No external side effect occurred, so retry is safe.",
  };
}
