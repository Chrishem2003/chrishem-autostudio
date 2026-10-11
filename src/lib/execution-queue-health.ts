export const EXECUTION_QUEUE_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "needs_review",
  "dead_letter",
] as const;

export type ExecutionQueueStatus = (typeof EXECUTION_QUEUE_STATUSES)[number];

export interface ExecutionQueueHealthRow {
  status: string;
  attempts: number;
  max_attempts: number;
  available_at: string;
  created_at: string;
  updated_at: string;
  last_error: string | null;
  trigger_type: string;
}

export interface ExecutionQueueHealthSummary {
  counts: Record<ExecutionQueueStatus, number>;
  sampledAt: string;
  oldestQueuedAt: string | null;
  recentFailures: Array<{
    status: "failed" | "needs_review" | "dead_letter";
    attempts: number;
    maxAttempts: number;
    updatedAt: string;
    triggerType: string;
    error: string;
  }>;
}

/** Pure formatter for the internal, secret-protected queue-health endpoint. */
export function summarizeExecutionQueueHealth(
  counts: Record<ExecutionQueueStatus, number>,
  rows: ExecutionQueueHealthRow[],
  sampledAt: string,
  sanitize: (value: unknown, fallback: string) => string,
): ExecutionQueueHealthSummary {
  const queued = rows
    .filter((row) => row.status === "queued")
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const recentFailures = rows
    .filter((row): row is ExecutionQueueHealthRow & { status: "failed" | "needs_review" | "dead_letter" } =>
      row.status === "failed" || row.status === "needs_review" || row.status === "dead_letter")
    .slice(0, 10)
    .map((row) => ({
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      updatedAt: row.updated_at,
      triggerType: row.trigger_type,
      error: sanitize(row.last_error, "No safe error detail is available."),
    }));

  return {
    counts,
    sampledAt,
    oldestQueuedAt: queued[0]?.created_at ?? null,
    recentFailures,
  };
}
