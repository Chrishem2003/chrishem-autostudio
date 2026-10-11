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
  | "successful_audit_run_without_completion_timestamp";

export interface AuditConsistencyFinding {
  issue: AuditConsistencyIssue;
  jobId: string;
  runId: string | null;
}

/**
 * Compares a bounded snapshot of queue jobs and their linked audit runs.
 * Findings are advisory: this function never mutates jobs or audit history.
 */
export function findExecutionAuditConsistencyIssues(
  jobs: AuditConsistencyJob[],
  runs: AuditConsistencyRun[],
): AuditConsistencyFinding[] {
  const runsById = new Map(runs.map((run) => [run.id, run]));
  const findings: AuditConsistencyFinding[] = [];

  for (const job of jobs) {
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

    const run = runsById.get(job.run_id);
    if (!run) {
      findings.push({ issue: "linked_run_missing", jobId: job.id, runId: job.run_id });
      if (job.status === "succeeded") {
        findings.push({ issue: "succeeded_job_without_confirmed_successful_run", jobId: job.id, runId: job.run_id });
      }
      continue;
    }

    if (run.status === "succeeded" && !run.finished_at) {
      findings.push({ issue: "successful_audit_run_without_completion_timestamp", jobId: job.id, runId: run.id });
    }
    if (job.status === "succeeded" && (run.status !== "succeeded" || !run.finished_at)) {
      findings.push({ issue: "succeeded_job_without_confirmed_successful_run", jobId: job.id, runId: run.id });
    }
    if (
      ["queued", "failed", "needs_review", "dead_letter"].includes(job.status) &&
      run.status === "succeeded" &&
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
      ["succeeded", "failed"].includes(run.status)
    ) {
      findings.push({ issue: "running_job_with_terminal_audit_run", jobId: job.id, runId: run.id });
    }
  }

  return findings;
}
