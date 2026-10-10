// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { buildRunFinalization } from "../run-finalization";

const startedAtMs = 1_000;

describe("shared run finalization", () => {
  it("marks a clean live run successful and computes duration", () => {
    const result = buildRunFinalization({
      mode: "live",
      startedAtMs,
      finishedAt: new Date(3_500),
      steps: [{ status: "success", detail: "ok" }],
    });
    expect(result).toEqual({
      status: "success",
      finishedAt: new Date(3_500).toISOString(),
      durationMs: 2_500,
      errorSummary: null,
    });
  });

  it("marks a dry run correctly when no step fails", () => {
    const result = buildRunFinalization({
      mode: "dry",
      startedAtMs,
      finishedAt: new Date(2_000),
      steps: [{ status: "dry_run", detail: "simulated" }],
    });
    expect(result.status).toBe("dry_run");
    expect(result.errorSummary).toBeNull();
  });

  it("uses the first failed step as the bounded error summary", () => {
    const result = buildRunFinalization({
      mode: "live",
      startedAtMs,
      finishedAt: new Date(2_000),
      steps: [
        { status: "success", detail: "ok" },
        { status: "failed", detail: "first failure" },
        { status: "failed", detail: "second failure" },
      ],
    });
    expect(result.status).toBe("failed");
    expect(result.errorSummary).toBe("first failure");
  });

  it("never returns a negative duration", () => {
    const result = buildRunFinalization({
      mode: "live",
      startedAtMs: 5_000,
      finishedAt: new Date(1_000),
      steps: [],
    });
    expect(result.durationMs).toBe(0);
  });
});
