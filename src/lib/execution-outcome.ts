export type StepStatus = "success" | "failed" | "dry_run";
export type OutcomeState = "confirmed" | "uncertain" | "not_attempted";

/**
 * Classifies whether an external side effect may have happened even if the
 * executor could not confirm it. Conservative by design: transport failures,
 * timeouts, provider 5xx responses, and thrown executor errors need inspection.
 */
export function classifyExecutionOutcome(status: StepStatus, detail: string): OutcomeState {
  if (status === "success") return "confirmed";
  if (status === "dry_run") return "not_attempted";

  return /network error|no reply|couldn't reach|did not respond|timed? ?out|timeout|unexpectedly|verify external effects|outcome could not be safely recorded|provider error|http 5\d\d|status 5\d\d|got 5\d\d/i.test(detail)
    ? "uncertain"
    : "not_attempted";
}
