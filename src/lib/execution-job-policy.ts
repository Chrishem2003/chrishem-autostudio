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
  // This policy sits at a runtime boundary. Snapshot all values exactly once:
  // malformed adapters can pass proxies/getters even though TypeScript forbids it.
  let sideEffectCertainty: unknown;
  let attempts: unknown;
  let maxAttempts: unknown;
  try {
    if (!input || typeof input !== "object") {
      throw new Error("Invalid retry policy input");
    }
    const candidate = input as unknown as Record<string, unknown>;
    sideEffectCertainty = candidate["sideEffectCertainty"];
    attempts = candidate["attempts"];
    maxAttempts = candidate["maxAttempts"];
  } catch {
    return {
      status: "needs_review",
      retryAllowed: false,
      reason: "Retry policy input could not be read safely; verify the external outcome before retrying.",
    };
  }

  if (![
    "not_attempted",
    "confirmed_no_effect",
    "uncertain",
    "effect_confirmed",
  ].includes(sideEffectCertainty as SideEffectCertainty)) {
    return {
      status: "needs_review",
      retryAllowed: false,
      reason: "Side-effect certainty is invalid; verify the external outcome before retrying.",
    };
  }
  if (!Number.isInteger(attempts) || (attempts as number) < 1) {
    throw new Error("attempts must be a positive integer");
  }
  if (!Number.isInteger(maxAttempts) || (maxAttempts as number) < 1 || (maxAttempts as number) > 10) {
    throw new Error("maxAttempts must be an integer between 1 and 10");
  }
  if ((attempts as number) > (maxAttempts as number)) {
    throw new Error("attempts cannot exceed maxAttempts");
  }

  if (sideEffectCertainty === "uncertain") {
    return {
      status: "needs_review",
      retryAllowed: false,
      reason: "The side effect may already have occurred; verify it before retrying.",
    };
  }
  if (sideEffectCertainty === "effect_confirmed") {
    return {
      status: "needs_review",
      retryAllowed: false,
      reason: "The side effect is confirmed; do not repeat it as a retry.",
    };
  }

  if ((attempts as number) >= (maxAttempts as number)) {
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
