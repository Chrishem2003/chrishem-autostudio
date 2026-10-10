export type StepStatus = "success" | "failed" | "dry_run";
export type OutcomeState = "confirmed" | "uncertain" | "not_attempted";

/**
 * Classifies whether an external side effect may have happened when a step
 * fails. Unknown failure messages default to uncertain: prose is not reliable
 * enough evidence that a provider action definitely did not occur.
 */
export function classifyExecutionOutcome(status: StepStatus, detail: string): OutcomeState {
  if (status === "success") return "confirmed";
  if (status === "dry_run") return "not_attempted";

  // These messages identify known failures before any provider request starts.
  if (/\b(?:preflight failed|not connected|unsupported HTTP method|missing required configuration|invalid local configuration|no action was attempted)\b/i.test(detail)) {
    return "not_attempted";
  }

  // All other failures are conservative by default, including unknown errors,
  // timeouts, provider 5xx responses, and failures to persist the final outcome.
  return "uncertain";
}
