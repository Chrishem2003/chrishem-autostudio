/**
 * Prevent live provider side effects from bypassing the durable execution
 * queue during staged rollout. Dry runs remain available.
 */
export function assertLiveExecutionQueueEnabled(
  mode: "dry" | "live",
  queueEnabled: boolean,
): void {
  if (mode === "live" && !queueEnabled) {
    throw new Error(
      "Live execution is temporarily unavailable while the durable queue is disabled. No external action was taken.",
    );
  }
}
