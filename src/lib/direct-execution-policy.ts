/**
 * Legacy single-step provider endpoints cannot prove durable job ownership,
 * idempotency, or queue-level recovery. Keep them closed even when the queue
 * feature flag is enabled; live effects must enter through executeAutomationFlow.
 */
export function assertDirectProviderExecutionDisabled(): never {
  throw new Error(
    "Direct provider execution is disabled. Start a live run through the durable execution queue; no external action was taken.",
  );
}
