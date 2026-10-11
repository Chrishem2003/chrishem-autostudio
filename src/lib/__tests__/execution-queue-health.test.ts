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
    expect(summary.sampledCount).toBe(100);
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
    expect(summary).toMatchObject({ totalCount: 1, sampledCount: 1, truncated: false });
  });

  test("safely handles an invalid aggregate count", () => {
    const summary = summarizeExpiredExecutionLeases(Number.NaN, []);
    expect(summary).toMatchObject({ totalCount: 0, sampledCount: 0, truncated: false });
  });
});


describe("summarizeStaleRunCandidates", () => {
  test("reports exact candidate totals separately from the bounded sample", () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      id: `run-${index}`,
      automation_id: `automation-${index}`,
      trigger_type: index % 2 ? "manual" : "schedule",
      started_at: "2026-10-11T09:00:00.000Z",
    }));
    const summary = summarizeStaleRunCandidates(137, rows, "2026-10-11T10:00:00.000Z");
    expect(summary.totalCount).toBe(137);
    expect(summary.sampledCount).toBe(100);
    expect(summary.truncated).toBe(true);
    expect(summary.sample).toHaveLength(20);
    expect(summary.cutoff).toBe("2026-10-11T10:00:00.000Z");
  });

  test("does not claim truncation when all candidates fit in the sample", () => {
    const summary = summarizeStaleRunCandidates(1, [{
      id: "run-1",
      automation_id: "automation-1",
      trigger_type: "manual",
      started_at: "2026-10-11T09:00:00.000Z",
    }], "2026-10-11T10:00:00.000Z");
    expect(summary).toMatchObject({ totalCount: 1, sampledCount: 1, truncated: false });
  });
});
