// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, test } from "bun:test";
import { findExecutionAuditConsistencyIssues } from "../execution-audit-consistency";

describe("findExecutionAuditConsistencyIssues", () => {
  test("returns no findings for aligned queue and audit states", () => {
    expect(findExecutionAuditConsistencyIssues(
      [
        { id: "queued", status: "queued", run_id: null },
        { id: "running", status: "running", run_id: "run-active" },
        { id: "done", status: "succeeded", run_id: "run-done", finished_at: "2026-10-11T10:00:01Z" },
      ],
      [
        { id: "run-active", status: "running" },
        { id: "run-done", status: "succeeded", finished_at: "2026-10-11T10:00:00Z" },
      ],
    )).toEqual([]);
  });

  test("fails closed when a queue job ID appears more than once in the diagnostic snapshot", () => {
    expect(findExecutionAuditConsistencyIssues(
      [
        { id: "duplicate-job", status: "succeeded", run_id: "run-success", finished_at: "2026-10-13T12:00:01Z" },
        { id: "duplicate-job", status: "failed", run_id: "run-failed", finished_at: "2026-10-13T12:00:02Z" },
        { id: "unrelated-job", status: "queued", run_id: null },
      ],
      [
        { id: "run-success", status: "success", finished_at: "2026-10-13T12:00:00Z" },
        { id: "run-failed", status: "failed", finished_at: "2026-10-13T12:00:00Z" },
      ],
    )).toEqual([
      { issue: "duplicate_queue_job_snapshot_id", jobId: "duplicate-job", runId: null },
    ]);
  });

  test("fails closed when a linked audit run ID appears more than once in the diagnostic snapshot", () => {
    expect(findExecutionAuditConsistencyIssues(
      [{ id: "succeeded-job", status: "succeeded", run_id: "ambiguous-run", finished_at: "2026-10-11T10:00:01Z" }],
      [
        { id: "ambiguous-run", status: "succeeded", finished_at: "2026-10-11T10:00:00Z" },
        { id: "ambiguous-run", status: "failed", finished_at: "2026-10-11T10:00:00Z" },
      ],
    )).toEqual([
      { issue: "duplicate_audit_run_snapshot_id", jobId: "succeeded-job", runId: "ambiguous-run" },
      { issue: "succeeded_job_without_confirmed_successful_run", jobId: "succeeded-job", runId: "ambiguous-run" },
    ]);
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

  test("flags non-success and running queue jobs linked to canonical success audit rows", () => {
    expect(findExecutionAuditConsistencyIssues(
      [
        { id: "review-job", status: "needs_review", run_id: "run-success" },
        { id: "running-job", status: "running", run_id: "run-success" },
      ],
      [{ id: "run-success", status: "success", finished_at: "2026-10-13T12:00:00Z" }],
    )).toEqual([
      { issue: "audit_run_linked_to_multiple_queue_jobs", jobId: "review-job", runId: "run-success" },
      { issue: "non_successful_job_with_successful_audit_run", jobId: "review-job", runId: "run-success" },
      { issue: "audit_run_linked_to_multiple_queue_jobs", jobId: "running-job", runId: "run-success" },
      { issue: "running_job_with_terminal_audit_run", jobId: "running-job", runId: "run-success" },
    ]);
  });

  test("flags audit runs linked to multiple queue jobs", () => {
    expect(findExecutionAuditConsistencyIssues(
      [
        { id: "job-success", status: "succeeded", run_id: "shared-run", finished_at: "2026-10-13T12:00:02Z" },
        { id: "job-retry", status: "queued", run_id: "shared-run" },
      ],
      [{ id: "shared-run", status: "success", finished_at: "2026-10-13T12:00:01Z" }],
    )).toEqual([
      { issue: "audit_run_linked_to_multiple_queue_jobs", jobId: "job-success", runId: "shared-run" },
      { issue: "audit_run_linked_to_multiple_queue_jobs", jobId: "job-retry", runId: "shared-run" },
      { issue: "non_successful_job_with_successful_audit_run", jobId: "job-retry", runId: "shared-run" },
    ]);
  });

  test("flags queue success timestamp that predates its audit run completion", () => {
    expect(findExecutionAuditConsistencyIssues(
      [{ id: "out-of-order-job", status: "succeeded", run_id: "later-run", finished_at: "2026-10-13T12:00:00Z" }],
      [{ id: "later-run", status: "success", finished_at: "2026-10-13T12:00:01Z" }],
    )).toEqual([
      { issue: "queue_completed_before_audit_run", jobId: "out-of-order-job", runId: "later-run" },
    ]);
  });

  test("accepts the canonical manual/scheduled audit status success for a succeeded queue job", () => {
    expect(findExecutionAuditConsistencyIssues(
      [{
        id: "successful-job",
        status: "succeeded",
        run_id: "run-success",
        finished_at: "2026-10-13T12:00:01Z",
      }],
      [{
        id: "run-success",
        status: "success",
        finished_at: "2026-10-13T12:00:00Z",
      }],
    )).toEqual([]);
  });

  test("requires a confirmed successful audit run before accepting queue success", () => {
    expect(findExecutionAuditConsistencyIssues(
      [
        { id: "no-run", status: "succeeded", run_id: null, finished_at: "2026-10-11T10:00:01Z" },
        { id: "failed-run", status: "succeeded", run_id: "run-failed", finished_at: "2026-10-11T10:00:01Z" },
        { id: "unfinished-run", status: "succeeded", run_id: "run-open", finished_at: "2026-10-11T10:00:01Z" },
        { id: "missing-run", status: "succeeded", run_id: "deleted-run", finished_at: "2026-10-11T10:00:01Z" },
      ],
      [
        { id: "run-failed", status: "failed", finished_at: "2026-10-11T10:00:00Z" },
        { id: "run-open", status: "succeeded", finished_at: null },
      ],
    )).toEqual([
      { issue: "succeeded_job_without_confirmed_successful_run", jobId: "no-run", runId: null },
      { issue: "succeeded_job_without_confirmed_successful_run", jobId: "failed-run", runId: "run-failed" },
      { issue: "successful_audit_run_without_completion_timestamp", jobId: "unfinished-run", runId: "run-open" },
      { issue: "succeeded_job_without_confirmed_successful_run", jobId: "unfinished-run", runId: "run-open" },
      { issue: "linked_run_missing", jobId: "missing-run", runId: "deleted-run" },
      { issue: "succeeded_job_without_confirmed_successful_run", jobId: "missing-run", runId: "deleted-run" },
    ]);
  });

  test("detects completion timestamps on active records and missing timestamps on terminal failures", () => {
    expect(findExecutionAuditConsistencyIssues(
      [
        { id: "active-job", status: "running", run_id: "active-run", finished_at: "2026-10-13T12:00:01Z" },
        { id: "failed-job", status: "failed", run_id: "failed-run", finished_at: "2026-10-13T12:00:02Z" },
      ],
      [
        { id: "active-run", status: "running", finished_at: "2026-10-13T12:00:00Z" },
        { id: "failed-run", status: "failed", finished_at: null },
      ],
    )).toEqual([
      { issue: "active_job_with_completion_timestamp", jobId: "active-job", runId: "active-run" },
      { issue: "running_audit_run_with_completion_timestamp", jobId: "active-job", runId: "active-run" },
      { issue: "terminal_audit_run_without_completion_timestamp", jobId: "failed-job", runId: "failed-run" },
    ]);
  });

  test("rejects malformed queue and audit completion timestamps", () => {
    expect(findExecutionAuditConsistencyIssues(
      [
        { id: "bad-queue-time", status: "succeeded", run_id: "run-ok", finished_at: "not-a-date" },
        { id: "bad-run-time", status: "succeeded", run_id: "run-bad-time", finished_at: "2026-10-13T12:00:01Z" },
        { id: "empty-failure-time", status: "failed", run_id: "run-empty-time", finished_at: "2026-10-13T12:00:02Z" },
      ],
      [
        { id: "run-ok", status: "success", finished_at: "2026-10-13T12:00:00Z" },
        { id: "run-bad-time", status: "success", finished_at: "not-a-date" },
        { id: "run-empty-time", status: "failed", finished_at: "" },
      ],
    )).toEqual([
      { issue: "invalid_queue_completion_timestamp", jobId: "bad-queue-time", runId: "run-ok" },
      { issue: "succeeded_job_without_queue_completion_timestamp", jobId: "bad-queue-time", runId: "run-ok" },
      { issue: "invalid_audit_run_completion_timestamp", jobId: "bad-run-time", runId: "run-bad-time" },
      { issue: "successful_audit_run_without_completion_timestamp", jobId: "bad-run-time", runId: "run-bad-time" },
      { issue: "succeeded_job_without_confirmed_successful_run", jobId: "bad-run-time", runId: "run-bad-time" },
      { issue: "invalid_audit_run_completion_timestamp", jobId: "empty-failure-time", runId: "run-empty-time" },
      { issue: "terminal_audit_run_without_completion_timestamp", jobId: "empty-failure-time", runId: "run-empty-time" },
    ]);
  });

  test("detects success without queue completion time and non-success jobs linked to successful runs", () => {
    expect(findExecutionAuditConsistencyIssues(
      [
        { id: "missing-finished-at", status: "succeeded", run_id: "run-ok" },
        { id: "review-after-success", status: "needs_review", run_id: "run-ok" },
        { id: "retry-after-success", status: "queued", run_id: "run-ok" },
      ],
      [{ id: "run-ok", status: "succeeded", finished_at: "2026-10-11T10:00:00Z" }],
    )).toEqual([
      { issue: "succeeded_job_without_queue_completion_timestamp", jobId: "missing-finished-at", runId: "run-ok" },
      { issue: "audit_run_linked_to_multiple_queue_jobs", jobId: "missing-finished-at", runId: "run-ok" },
      { issue: "audit_run_linked_to_multiple_queue_jobs", jobId: "review-after-success", runId: "run-ok" },
      { issue: "non_successful_job_with_successful_audit_run", jobId: "review-after-success", runId: "run-ok" },
      { issue: "audit_run_linked_to_multiple_queue_jobs", jobId: "retry-after-success", runId: "run-ok" },
      { issue: "non_successful_job_with_successful_audit_run", jobId: "retry-after-success", runId: "run-ok" },
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
        { id: "finished-job", status: "succeeded", run_id: "still-running", finished_at: "2026-10-11T10:00:01Z" },
        { id: "queued-job", status: "queued", run_id: "still-running" },
        { id: "active-job", status: "running", run_id: "failed-run" },
      ],
      [
        { id: "still-running", status: "running" },
        { id: "failed-run", status: "failed", finished_at: "2026-10-11T10:00:00Z" },
      ],
    )).toEqual([
      { issue: "audit_run_linked_to_multiple_queue_jobs", jobId: "finished-job", runId: "still-running" },
      { issue: "succeeded_job_without_confirmed_successful_run", jobId: "finished-job", runId: "still-running" },
      { issue: "audit_run_linked_to_multiple_queue_jobs", jobId: "queued-job", runId: "still-running" },
      { issue: "nonrunning_job_with_running_audit_run", jobId: "queued-job", runId: "still-running" },
      { issue: "running_job_with_terminal_audit_run", jobId: "active-job", runId: "failed-run" },
    ]);
  });

  test("flags successful audit runs that lack their own completion timestamp", () => {
    expect(findExecutionAuditConsistencyIssues(
      [{ id: "failed-job", status: "failed", run_id: "run-without-finished-at" }],
      [{ id: "run-without-finished-at", status: "succeeded", finished_at: null }],
    )).toEqual([
      {
        issue: "successful_audit_run_without_completion_timestamp",
        jobId: "failed-job",
        runId: "run-without-finished-at",
      },
    ]);
  });

  test("treats cancelled and timed-out audit runs as terminal for running-job diagnostics", () => {
    expect(findExecutionAuditConsistencyIssues(
      [
        { id: "cancelled-job", status: "running", run_id: "run-cancelled" },
        { id: "timed-out-job", status: "running", run_id: "run-timeout" },
      ],
      [
        { id: "run-cancelled", status: "cancelled", finished_at: "2026-10-11T10:00:00Z" },
        { id: "run-timeout", status: "timed_out", finished_at: "2026-10-11T10:00:00Z" },
      ],
    )).toEqual([
      { issue: "running_job_with_terminal_audit_run", jobId: "cancelled-job", runId: "run-cancelled" },
      { issue: "running_job_with_terminal_audit_run", jobId: "timed-out-job", runId: "run-timeout" },
    ]);
  });
});
