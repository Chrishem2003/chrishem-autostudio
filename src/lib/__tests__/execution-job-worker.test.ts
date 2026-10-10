// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, test } from "bun:test";
import { processOneExecutionJob } from "../execution-job-worker";

const job = {
  id: "job-1",
  automationId: "automation-1",
  payload: {},
  attempts: 1,
  maxAttempts: 3,
  workerToken: "token-1",
  idempotencyKey: "stable-job-key",
};

function dependencies(overrides = {}) {
  const calls = { finished: [], heartbeats: 0 };
  return {
    calls,
    deps: {
      claim: async () => job,
      heartbeat: async () => { calls.heartbeats++; return true; },
      execute: async () => ({ status: "succeeded", sideEffectCertainty: "effect_confirmed" }),
      finish: async (_job, status, error, retryAt) => {
        calls.finished.push({ status, error, retryAt });
        return true;
      },
      ...overrides,
    },
  };
}

describe("processOneExecutionJob", () => {
  test("returns empty when no job is ready", async () => {
    const { deps } = dependencies({ claim: async () => null });
    expect(await processOneExecutionJob(deps)).toEqual({ outcome: "empty" });
  });

  test("finalizes successful execution", async () => {
    const { deps, calls } = dependencies();
    const result = await processOneExecutionJob(deps);
    expect(result).toEqual({ outcome: "finished", jobId: "job-1", status: "succeeded" });
    expect(calls.finished[0].status).toBe("succeeded");
  });

  test("routes uncertain failures to manual review", async () => {
    const { deps, calls } = dependencies({
      execute: async () => ({ status: "failed", sideEffectCertainty: "uncertain", error: "Timed out" }),
    });
    const result = await processOneExecutionJob(deps);
    expect(result.status).toBe("needs_review");
    expect(calls.finished[0].status).toBe("needs_review");
  });

  test("requeues only a failure known to have no side effect", async () => {
    const { deps, calls } = dependencies({
      execute: async () => ({ status: "failed", sideEffectCertainty: "not_attempted", error: "Preflight failed" }),
    });
    const result = await processOneExecutionJob(deps);
    expect(result.status).toBe("queued");
    expect(calls.finished[0].status).toBe("queued");
  });

  test("passes the stable idempotency key through the retry policy", async () => {
    const { deps, calls } = dependencies({
      execute: async () => ({
        status: "failed",
        sideEffectCertainty: "uncertain",
        error: "Provider timeout",
        providerSupportsIdempotency: true,
      }),
    });
    const result = await processOneExecutionJob(deps);
    expect(result.status).toBe("queued");
    expect(calls.finished[0].status).toBe("queued");
  });

  test("does not finalize after heartbeat detects a lost lease", async () => {
    const { deps, calls } = dependencies({
      execute: async (_job, context) => {
        await context.heartbeat();
        return { status: "succeeded", sideEffectCertainty: "effect_confirmed" };
      },
      heartbeat: async () => false,
    });
    expect(await processOneExecutionJob(deps)).toEqual({ outcome: "lease_lost", jobId: "job-1" });
    expect(calls.finished).toHaveLength(0);
  });

  test("fails closed when heartbeat transport throws", async () => {
    const { deps, calls } = dependencies({
      execute: async (_job, context) => {
        const alive = await context.heartbeat();
        expect(alive).toBe(false);
        return { status: "succeeded", sideEffectCertainty: "effect_confirmed" };
      },
      heartbeat: async () => { throw new Error("database unavailable"); },
    });
    expect(await processOneExecutionJob(deps)).toEqual({ outcome: "lease_lost", jobId: "job-1" });
    expect(calls.finished).toHaveLength(0);
  });

  test("reports uncertain finalization when finish transport throws", async () => {
    const { deps } = dependencies({
      finish: async () => { throw new Error("database unavailable"); },
    });
    expect(await processOneExecutionJob(deps)).toEqual({
      outcome: "finalization_rejected",
      jobId: "job-1",
    });
  });

  test("treats thrown execution errors as uncertain", async () => {
    const { deps, calls } = dependencies({ execute: async () => { throw new Error("network timeout"); } });
    const result = await processOneExecutionJob(deps);
    expect(result.status).toBe("needs_review");
    expect(calls.finished[0].error).toContain("network timeout");
  });

  test("reports rejected finalization instead of claiming success", async () => {
    const { deps } = dependencies({ finish: async () => false });
    expect(await processOneExecutionJob(deps)).toEqual({
      outcome: "finalization_rejected",
      jobId: "job-1",
    });
  });
});
