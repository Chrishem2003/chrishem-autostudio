/**
 * Bounded exponential backoff for safe durable-job retries.
 *
 * Attempt counts are 1-based (the current attempt already claimed by a worker).
 * Explicit provider/lock retry times can override this default; otherwise we
 * delay retries to prevent a transient outage from turning into a hot loop.
 */
const BACKOFF_SECONDS = [5, 30, 120, 600, 1_800, 3_600] as const;

export function executionRetryAt(attempts: number, now = new Date()): string {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10) {
    throw new Error("attempts must be an integer between 1 and 10");
  }
  if (!Number.isFinite(now.getTime())) {
    throw new Error("now must be a valid date");
  }

  const index = Math.min(attempts - 1, BACKOFF_SECONDS.length - 1);
  return new Date(now.getTime() + BACKOFF_SECONDS[index]! * 1_000).toISOString();
}
