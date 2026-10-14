/* eslint @typescript-eslint/ban-ts-comment: off */
// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, test } from "bun:test";
import { summarizeExecutionQueueHealth, summarizeExpiredExecutionLeases, summarizeStaleRunCandidates, type ExecutionQueueHealthRow, type ExecutionQueueStatus } from "@/lib/execution-queue-health";

const emptyCounts = (): Record<ExecutionQueueStatus, number> => ({
  queued: 0,
  running: 0,
  succeeded: 0,
  failed: 0,
  needs_review: 0,
  dead_letter: 0,
});

const row = (overrides: Partial<ExecutionQueueHealthRow> = {}): ExecutionQueueHealthRow => ({
  status: "queued",
  attempts: 0,
  max_attempts: 3,
  available_at: "2026-10-11T10:00:00.000Z",
  created_at: "2026-10-11T09:00:00.000Z",
  updated_at: "2026-10-11T09:00:00.000Z",
  last_error: null,
  trigger_type: "manual",
  ...overrides,
});

describe("summarizeExecutionQueueHealth", () => {
  test("reports the oldest queued timestamp and keeps the supplied aggregate counts", () => {
    const counts = { ...emptyCounts(), queued: 12, running: 2 };
    const summary = summarizeExecutionQueueHealth(
      counts,
      [row({ created_at: "2026-10-11T09:05:00.000Z" }), row()],
      "2026-10-11T10:00:00.000Z",
      (value, fallback) => typeof value === "string" ? value : fallback,
    );

    expect(summary.counts).toEqual(counts);
    expect(summary.oldestQueuedAt).toBe("2026-10-11T09:00:00.000Z");
    expect(summary.sampledAt).toBe("2026-10-11T10:00:00.000Z");
  });

  test("includes only failure states and sanitizes error detail", () => {
    const summary = summarizeExecutionQueueHealth(
      emptyCounts(),
      [
        row({ status: "succeeded", last_error: "should not appear" }),
        row({ status: "needs_review", last_error: "token=secret-value", attempts: 2 }),
        row({ status: "dead_letter", last_error: null }),
      ],
      "2026-10-11T10:00:00.000Z",
      (value, fallback) => typeof value === "string" ? value.replace(/token=[^ ]+/gi, "[REDACTED_SECRET]") : fallback,
    );

    expect(summary.recentFailures).toHaveLength(2);
    expect(summary.recentFailures[0]?.status).toBe("needs_review");
    expect(summary.recentFailures[0]?.error).toBe("[REDACTED_SECRET]");
    expect(summary.recentFailures[1]?.error).toBe("No safe error detail is available.");
    expect(JSON.stringify(summary)).not.toContain("secret-value");
  });
});

describe("summarizeExpiredExecutionLeases", () => {
  test("distinguishes the exact total from a bounded diagnostic sample", () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      id: `job-${index}`,
      locked_until: "2026-10-11T09:00:00.000Z",
      updated_at: "2026-10-11T08:55:00.000Z",
      attempts: 2,
      max_attempts: 3,
    }));
    const summary = summarizeExpiredExecutionLeases(137, rows);
    expect(summary.totalCount).toBe(137);
    expect(summary.sampledCount).toBe(20);
    expect(summary.inspectedCount).toBe(100);
    expect(summary.truncated).toBe(true);
    expect(summary.sample).toHaveLength(20);
  });

  test("does not report a truncated sample when all expired leases fit", () => {
    const summary = summarizeExpiredExecutionLeases(1, [{
      id: "job-1",
      locked_until: "2026-10-11T09:00:00.000Z",
      updated_at: "2026-10-11T08:55:00.000Z",
      attempts: 1,
      max_attempts: 3,
    }]);
    expect(summary).toMatchObject({ totalCount: 1, sampledCount: 1, inspectedCount: 1, truncated: false });
  });

  test("safely handles an invalid aggregate count", () => {
    const summary = summarizeExpiredExecutionLeases(Number.NaN, []);
    expect(summary).toMatchObject({ totalCount: 0, sampledCount: 0, inspectedCount: 0, truncated: false });
  });
});


describe("summarizeStaleRunCandidates", () => {
  test("reports exact candidate totals separately from the bounded sample", () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      id: `run-${index}`,
      trigger_type: index % 2 ? "manual" : "schedule",
      started_at: "2026-10-11T09:00:00.000Z",
    }));
    const summary = summarizeStaleRunCandidates(137, rows, "2026-10-11T10:00:00.000Z");
    expect(summary.totalCount).toBe(137);
    expect(summary.sampledCount).toBe(20);
    expect(summary.inspectedCount).toBe(100);
    expect(summary.truncated).toBe(true);
    expect(summary.sample).toHaveLength(20);
    expect(JSON.stringify(summary)).not.toContain("automation_id");
    expect(JSON.stringify(summary)).not.toContain("automationId");
    expect(summary.cutoff).toBe("2026-10-11T10:00:00.000Z");
  });

  test("does not claim truncation when all candidates fit in the sample", () => {
    const summary = summarizeStaleRunCandidates(1, [{
      id: "run-1",
      trigger_type: "manual",
      started_at: "2026-10-11T09:00:00.000Z",
    }], "2026-10-11T10:00:00.000Z");
    expect(summary).toMatchObject({ totalCount: 1, sampledCount: 1, truncated: false });
  });
});


describe("buildExecutionQueueAlerts", () => {
  const base = () => ({
    counts: emptyCounts(),
    sampledAt: "2026-10-13T10:00:00.000Z",
    oldestQueuedAt: null,
    expiredLeaseCount: 0,
    auditFindingCount: 0,
    auditScanTruncated: false,
    jobCountMismatch: false,
    staleRunCount: 0,
    staleRunSampleTruncated: false,
  });

  test("treats malformed queue status aggregates as a critical diagnostic failure", async () => {
    const { buildExecutionQueueAlerts } = await import("@/lib/execution-queue-health");
    const input = base();
    input.counts.queued = -1;
    const result = buildExecutionQueueAlerts(input);
    expect(result.status).toBe("critical");
    expect(result.alerts).toContainEqual({
      code: "invalid_queue_status_count",
      severity: "critical",
      count: 1,
      message: "Queue status aggregates are malformed; verify the monitoring query before using this snapshot.",
    });
  });

  test("fails closed when non-status diagnostic counters are negative or non-integer", async () => {
    const { buildExecutionQueueAlerts } = await import("@/lib/execution-queue-health");
    const input = base();
    input.expiredLeaseCount = -1;
    input.auditFindingCount = 1.5;
    input.staleRunCount = Number.NaN;
    const result = buildExecutionQueueAlerts(input);
    expect(result.status).toBe("critical");
    expect(result.alerts).toContainEqual({
      code: "invalid_queue_diagnostic_input",
      severity: "critical",
      count: 3,
      message: "Queue health diagnostic inputs are malformed; do not use this snapshot to authorize recovery.",
    });
  });

  test("fails closed when timestamps or queue count envelope are malformed", async () => {
    const { buildExecutionQueueAlerts } = await import("@/lib/execution-queue-health");
    const input = base();
    input.sampledAt = "not-a-timestamp";
    input.oldestQueuedAt = "also-not-a-timestamp";
    input.counts = null as unknown as Record<ExecutionQueueStatus, number>;
    const result = buildExecutionQueueAlerts(input);
    expect(result.status).toBe("critical");
    expect(result.alerts).toContainEqual({
      code: "invalid_queue_status_count",
      severity: "critical",
      count: 6,
      message: "Queue status aggregates are malformed; verify the monitoring query before using this snapshot.",
    });
    expect(result.alerts).toContainEqual({
      code: "invalid_queue_diagnostic_input",
      severity: "critical",
      count: 2,
      message: "Queue health diagnostic inputs are malformed; do not use this snapshot to authorize recovery.",
    });
  });

  test("reports healthy only when no operational thresholds are breached", async () => {
    const { buildExecutionQueueAlerts } = await import("@/lib/execution-queue-health");
    expect(buildExecutionQueueAlerts(base())).toEqual({ status: "healthy", alerts: [] });
  });

  test("marks uncertain jobs and expired leases critical without suggesting automatic recovery", async () => {
    const { buildExecutionQueueAlerts } = await import("@/lib/execution-queue-health");
    const input = base();
    input.counts.needs_review = 2;
    input.expiredLeaseCount = 1;
    const result = buildExecutionQueueAlerts(input);
    expect(result.status).toBe("critical");
    expect(result.alerts.map((alert) => alert.code)).toContain("jobs_needing_review");
    expect(result.alerts.map((alert) => alert.code)).toContain("expired_execution_leases");
    expect(result.alerts.find((alert) => alert.code === "expired_execution_leases")?.message).toContain("inspect audit records");
  });

  test("warns on queue age, failed jobs, and incomplete diagnostic snapshots", async () => {
    const { buildExecutionQueueAlerts } = await import("@/lib/execution-queue-health");
    const input = base();
    input.counts.queued = 3;
    input.counts.failed = 1;
    input.oldestQueuedAt = "2026-10-13T09:50:00.000Z";
    input.auditScanTruncated = true;
    input.jobCountMismatch = true;
    const result = buildExecutionQueueAlerts(input);
    expect(result.status).toBe("warning");
    expect(result.alerts.map((alert) => alert.code)).toEqual(expect.arrayContaining([
      "failed_jobs",
      "queue_wait_over_five_minutes",
      "audit_scan_incomplete",
      "queue_snapshot_mismatch",
    ]));
  });

  test("does not invent queue-age alerts for invalid timestamps", async () => {
    const { buildExecutionQueueAlerts } = await import("@/lib/execution-queue-health");
    const input = base();
    input.counts.queued = 4;
    input.oldestQueuedAt = "not-a-timestamp";
    const result = buildExecutionQueueAlerts(input);
    expect(result.status).toBe("critical");
    expect(result.alerts).toContainEqual({
      code: "invalid_queue_diagnostic_input",
      severity: "critical",
      count: 1,
      message: "Queue health diagnostic inputs are malformed; do not use this snapshot to authorize recovery.",
    });
  });
});
