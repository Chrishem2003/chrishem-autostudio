// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, test } from "bun:test";
import { findExecutionAuditConsistencyIssues } from "../execution-audit-consistency";

describe("findExecutionAuditConsistencyIssues", () => {
  test("returns no findings for aligned queue and audit states", () => {
    expect(findExecutionAuditConsistencyIssues(
      [
        { id: "queued", status: "queued", run_id: null },
        { id: "running", status: "running", run_id: "run-active" },
        { id: "done", status: "succeeded", run_id: "run-done" },
      ],
      [
        { id: "run-active", status: "running" },
        { id: "run-done", status: "succeeded", finished_at: "2026-10-11T10:00:00Z" },
      ],
    )).toEqual([]);
  });

  test("detects queue jobs without an audit run and missing linked runs", () => {
    expect(findExecutionAuditConsistencyIssues(
      [
        { id: "no-run", status: "running", run_id: null },
        { id: "missing", status: "failed", run_id: "deleted-run" },
      ],
      [],
    )).toEqual([
      { issue: "running_job_without_audit_run", jobId: "no-run", runId: null },
      { issue: "linked_run_missing", jobId: "missing", runId: "deleted-run" },
    ]);
  });

  test("requires a confirmed successful audit run before accepting queue success", () => {
    expect(findExecutionAuditConsistencyIssues(
      [
        { id: "no-run", status: "succeeded", run_id: null },
        { id: "failed-run", status: "succeeded", run_id: "run-failed" },
        { id: "unfinished-run", status: "succeeded", run_id: "run-open" },
        { id: "missing-run", status: "succeeded", run_id: "deleted-run" },
      ],
      [
        { id: "run-failed", status: "failed", finished_at: "2026-10-11T10:00:00Z" },
        { id: "run-open", status: "succeeded", finished_at: null },
      ],
    )).toEqual([
      { issue: "succeeded_job_without_confirmed_successful_run", jobId: "no-run", runId: null },
      { issue: "succeeded_job_without_confirmed_successful_run", jobId: "failed-run", runId: "run-failed" },
      { issue: "succeeded_job_without_confirmed_successful_run", jobId: "unfinished-run", runId: "run-open" },
      { issue: "linked_run_missing", jobId: "missing-run", runId: "deleted-run" },
      { issue: "succeeded_job_without_confirmed_successful_run", jobId: "missing-run", runId: "deleted-run" },
    ]);
  });

  test("detects a needs-review job whose run remains running", () => {
    expect(findExecutionAuditConsistencyIssues(
      [{ id: "review-job", status: "needs_review", run_id: "run-1" }],
      [{ id: "run-1", status: "running" }],
    )).toEqual([
      { issue: "review_job_with_running_audit_run", jobId: "review-job", runId: "run-1" },
    ]);
  });

  test("detects terminal mismatches and queued jobs linked to a still-running audit run", () => {
    expect(findExecutionAuditConsistencyIssues(
      [
        { id: "finished-job", status: "succeeded", run_id: "still-running" },
        { id: "queued-job", status: "queued", run_id: "still-running" },
        { id: "active-job", status: "running", run_id: "failed-run" },
      ],
      [
        { id: "still-running", status: "running" },
        { id: "failed-run", status: "failed" },
      ],
    )).toEqual([
      { issue: "succeeded_job_without_confirmed_successful_run", jobId: "finished-job", runId: "still-running" },
      { issue: "nonrunning_job_with_running_audit_run", jobId: "queued-job", runId: "still-running" },
      { issue: "running_job_with_terminal_audit_run", jobId: "active-job", runId: "failed-run" },
    ]);
  });
});
