export type AuditConsistencyJobStatus =
  | "queued" | "running" | "succeeded" | "failed" | "needs_review" | "dead_letter";

export interface AuditConsistencyJob {
  id: string;
  status: AuditConsistencyJobStatus;
  run_id: string | null;
  finished_at?: string | null;
}

export interface AuditConsistencyRun {
  id: string;
  status: string;
  finished_at?: string | null;
}

export type AuditConsistencyIssue =
  | "running_job_without_audit_run"
  | "nonrunning_job_with_running_audit_run"
  | "running_job_with_terminal_audit_run"
  | "review_job_with_running_audit_run"
  | "linked_run_missing"
  | "succeeded_job_without_confirmed_successful_run"
  | "succeeded_job_without_queue_completion_timestamp"
  | "non_successful_job_with_successful_audit_run"
  | "successful_audit_run_without_completion_timestamp"
  | "duplicate_audit_run_snapshot_id"
  | "duplicate_queue_job_snapshot_id";

export interface AuditConsistencyFinding {
  issue: AuditConsistencyIssue;
  jobId: string;
  runId: string | null;
}

const isSuccessfulAuditRun = (status: string) => status === "success" || status === "succeeded";

const TERMINAL_AUDIT_RUN_STATUSES = new Set([
  "success",
  "succeeded",
  "failed",
  "cancelled",
  "canceled",
  "timed_out",
  "abandoned",
]);

/**
 * Compares a bounded snapshot of queue jobs and their linked audit runs.
 * Findings are advisory: this function never mutates jobs or audit history.
 */
export function findExecutionAuditConsistencyIssues(
  jobs: AuditConsistencyJob[],
  runs: AuditConsistencyRun[],
): AuditConsistencyFinding[] {
  const runCounts = new Map<string, number>();
  for (const run of runs) runCounts.set(run.id, (runCounts.get(run.id) ?? 0) + 1);
  // A duplicate primary key should be impossible in a consistent database
  // snapshot. Never let arbitrary row ordering decide whether a linked job
  // appears healthy if the diagnostic input contains conflicting duplicates.
  const runsById = new Map(
    runs.filter((run) => runCounts.get(run.id) === 1).map((run) => [run.id, run]),
  );
  const findings: AuditConsistencyFinding[] = [];
  const jobCounts = new Map<string, number>();
  for (const job of jobs) jobCounts.set(job.id, (jobCounts.get(job.id) ?? 0) + 1);
  const reportedDuplicateJobs = new Set<string>();

  for (const job of jobs) {
    // Duplicate queue IDs mean the snapshot cannot reliably associate one
    // queue record with one audit run. Report once per ID and do not let row
    // ordering produce a misleading "healthy" diagnosis.
    if ((jobCounts.get(job.id) ?? 0) > 1) {
      if (!reportedDuplicateJobs.has(job.id)) {
        findings.push({ issue: "duplicate_queue_job_snapshot_id", jobId: job.id, runId: null });
        reportedDuplicateJobs.add(job.id);
      }
      continue;
    }
    if (job.status === "succeeded" && !job.finished_at) {
      findings.push({ issue: "succeeded_job_without_queue_completion_timestamp", jobId: job.id, runId: job.run_id });
    }
    if (job.status === "running" && job.run_id === null) {
      findings.push({ issue: "running_job_without_audit_run", jobId: job.id, runId: null });
      continue;
    }
    if (job.status === "succeeded" && job.run_id === null) {
      findings.push({ issue: "succeeded_job_without_confirmed_successful_run", jobId: job.id, runId: null });
      continue;
    }
    if (job.run_id === null) continue;

    if ((runCounts.get(job.run_id) ?? 0) > 1) {
      findings.push({ issue: "duplicate_audit_run_snapshot_id", jobId: job.id, runId: job.run_id });
      if (job.status === "succeeded") {
        findings.push({ issue: "succeeded_job_without_confirmed_successful_run", jobId: job.id, runId: job.run_id });
      }
      continue;
    }

    const run = runsById.get(job.run_id);
    if (!run) {
      findings.push({ issue: "linked_run_missing", jobId: job.id, runId: job.run_id });
      if (job.status === "succeeded") {
        findings.push({ issue: "succeeded_job_without_confirmed_successful_run", jobId: job.id, runId: job.run_id });
      }
      continue;
    }

    if (isSuccessfulAuditRun(run.status) && !run.finished_at) {
      findings.push({ issue: "successful_audit_run_without_completion_timestamp", jobId: job.id, runId: run.id });
    }
    if (job.status === "succeeded" && (!isSuccessfulAuditRun(run.status) || !run.finished_at)) {
      findings.push({ issue: "succeeded_job_without_confirmed_successful_run", jobId: job.id, runId: run.id });
    }
    if (
      ["queued", "failed", "needs_review", "dead_letter"].includes(job.status) &&
      isSuccessfulAuditRun(run.status) &&
      Boolean(run.finished_at)
    ) {
      findings.push({ issue: "non_successful_job_with_successful_audit_run", jobId: job.id, runId: run.id });
    }

    if (job.status === "needs_review" && run.status === "running") {
      findings.push({ issue: "review_job_with_running_audit_run", jobId: job.id, runId: run.id });
    } else if (
      ["queued", "failed", "dead_letter"].includes(job.status) &&
      run.status === "running"
    ) {
      findings.push({ issue: "nonrunning_job_with_running_audit_run", jobId: job.id, runId: run.id });
    } else if (
      job.status === "running" &&
      TERMINAL_AUDIT_RUN_STATUSES.has(run.status)
    ) {
      findings.push({ issue: "running_job_with_terminal_audit_run", jobId: job.id, runId: run.id });
    }
  }

  return findings;
}
