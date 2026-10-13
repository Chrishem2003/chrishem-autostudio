export type ScheduledEnqueueAttemptResult = {
  enqueueSucceeded: boolean;
  releaseSucceeded: boolean;
};

/**
 * Always attempt to release the scheduler lease, even when enqueue fails.
 * The release callback receives the enqueue outcome so callers can preserve
 * the previous schedule marker on failure and advance it only after enqueue.
 * Errors are reported by the injected callbacks and converted into an
 * explicit outcome, keeping the scheduler's per-automation loop alive.
 */
export async function runScheduledEnqueueAttempt(input: {
  enqueue: () => Promise<unknown>;
  release: (enqueueSucceeded: boolean) => Promise<unknown>;
}): Promise<ScheduledEnqueueAttemptResult> {
  let enqueueSucceeded = false;
  let releaseSucceeded = false;

  try {
    await input.enqueue();
    enqueueSucceeded = true;
  } catch {
    // The caller owns sanitized logging and failure accounting.
  }

  try {
    await input.release(enqueueSucceeded);
    releaseSucceeded = true;
  } catch {
    // A failed release must not be mistaken for a completed schedule update.
  }

  return { enqueueSucceeded, releaseSucceeded };
}
