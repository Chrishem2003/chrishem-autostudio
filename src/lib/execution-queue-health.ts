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

export interface ExpiredExecutionLeaseRow {
  id: string;
  locked_until: string;
  updated_at: string;
  attempts: number;
  max_attempts: number;
}

export interface ExpiredExecutionLeaseSummary {
  totalCount: number;
  /** Number of rows actually returned in the public diagnostic sample. */
  sampledCount: number;
  /** Number of database rows inspected to build the sample. */
  inspectedCount: number;
  truncated: boolean;
  sample: Array<{
    jobId: string;
    lockedUntil: string;
    updatedAt: string;
    attempts: number;
    maxAttempts: number;
  }>;
}

/** Keep a bounded diagnostic sample while reporting the database's exact total. */
export function summarizeExpiredExecutionLeases(
  totalCount: number,
  rows: ExpiredExecutionLeaseRow[],
): ExpiredExecutionLeaseSummary {
  const safeTotal = Number.isSafeInteger(totalCount) && totalCount >= 0 ? totalCount : rows.length;
  const sample = rows.slice(0, 20).map((job) => ({
    jobId: job.id,
    lockedUntil: job.locked_until,
    updatedAt: job.updated_at,
    attempts: job.attempts,
    maxAttempts: job.max_attempts,
  }));
  return {
    totalCount: safeTotal,
    sampledCount: sample.length,
    inspectedCount: rows.length,
    truncated: safeTotal > sample.length || rows.length > sample.length,
    sample,
  };
}


export interface StaleRunCandidateRow {
  id: string;
  trigger_type: string;
  started_at: string;
}

/**
 * Format a bounded stale-run sample without implying that sampled rows are the
 * full incident count. This is diagnostic only; it never authorizes a repair.
 */
export function summarizeStaleRunCandidates(
  totalCount: number,
  rows: StaleRunCandidateRow[],
  cutoff: string,
) {
  const safeTotal = Number.isSafeInteger(totalCount) && totalCount >= 0 ? totalCount : rows.length;
  const sample = rows.slice(0, 20).map((run) => ({
    runId: run.id,
    triggerType: run.trigger_type,
    startedAt: run.started_at,
  }));
  return {
    cutoff,
    totalCount: safeTotal,
    sampledCount: sample.length,
    inspectedCount: rows.length,
    truncated: safeTotal > sample.length || rows.length > sample.length,
    sample,
  };
}


export type ExecutionQueueAlertSeverity = "warning" | "critical";
export interface ExecutionQueueAlert {
  code: string;
  severity: ExecutionQueueAlertSeverity;
  count: number;
  message: string;
}
export interface ExecutionQueueAlertSummary {
  status: "healthy" | "warning" | "critical";
  alerts: ExecutionQueueAlert[];
}

/**
 * Converts queue and recovery diagnostics into actionable, non-mutating alerts.
 * Thresholds are deliberately conservative; alerts never authorize retries or repairs.
 */
export function buildExecutionQueueAlerts(input: {
  counts: Record<ExecutionQueueStatus, number>;
  sampledAt: string;
  oldestQueuedAt: string | null;
  expiredLeaseCount: number;
  auditFindingCount: number;
  auditScanTruncated: boolean;
  jobCountMismatch: boolean;
  staleRunCount: number;
  staleRunSampleTruncated: boolean;
}): ExecutionQueueAlertSummary {
  const alerts: ExecutionQueueAlert[] = [];
  const add = (code: string, severity: ExecutionQueueAlertSeverity, count: number, message: string) => {
    if (Number.isFinite(count) && count > 0) alerts.push({ code, severity, count, message });
  };

  add("jobs_needing_review", "critical", input.counts.needs_review,
    "One or more jobs need human verification before any retry.");
  add("dead_letter_jobs", "critical", input.counts.dead_letter,
    "One or more jobs exhausted their retry policy and need operator review.");
  add("expired_execution_leases", "critical", input.expiredLeaseCount,
    "Expired worker leases were found; inspect audit records before recovery.");
  add("audit_consistency_findings", "critical", input.auditFindingCount,
    "Queue and audit records disagree; reconcile the records before retrying affected jobs.");
  add("failed_jobs", "warning", input.counts.failed,
    "Failed jobs need review of the sanitized error and recorded execution outcome.");

  const sampledAtMs = Date.parse(input.sampledAt);
  const oldestQueuedAtMs = input.oldestQueuedAt ? Date.parse(input.oldestQueuedAt) : Number.NaN;
  if (
    Number.isFinite(sampledAtMs) &&
    Number.isFinite(oldestQueuedAtMs) &&
    sampledAtMs - oldestQueuedAtMs > 5 * 60 * 1000
  ) {
    add("queue_wait_over_five_minutes", "warning", input.counts.queued,
      "The oldest queued job has waited more than five minutes; verify worker scheduling and queue capacity.");
  }
  add("stale_open_runs", "warning", input.staleRunCount,
    "Long-running manual or scheduled audit runs need inspection; this diagnostic does not repair them.");
  add("audit_scan_incomplete", "warning", input.auditScanTruncated ? 1 : 0,
    "The audit consistency scan is bounded; some queue jobs were not inspected.");
  add("queue_snapshot_mismatch", "warning", input.jobCountMismatch ? 1 : 0,
    "Queue counts and the inspected snapshot differ; repeat the read before drawing conclusions.");
  add("stale_run_sample_truncated", "warning", input.staleRunSampleTruncated ? 1 : 0,
    "The stale-run sample is bounded; inspect the full count before planning recovery.");

  const status = alerts.some((alert) => alert.severity === "critical")
    ? "critical"
    : alerts.length > 0 ? "warning" : "healthy";
  return { status, alerts };
}
