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

  test("does not accept success when side effects are uncertain", async () => {
    const { deps, calls } = dependencies({
      execute: async () => ({
        status: "succeeded",
        sideEffectCertainty: "uncertain",
        error: "Provider response could not be verified",
      }),
    });
    const result = await processOneExecutionJob(deps);
    expect(result).toEqual({ outcome: "finished", jobId: "job-1", status: "needs_review" });
    expect(calls.finished[0].status).toBe("needs_review");
    expect(calls.finished[0].error).toBe("Provider response could not be verified");
  });

  test("does not accept success when no side effect was attempted", async () => {
    const { deps, calls } = dependencies({
      execute: async () => ({
        status: "succeeded",
        sideEffectCertainty: "not_attempted",
      }),
    });
    const result = await processOneExecutionJob(deps);
    expect(result.status).toBe("needs_review");
    expect(calls.finished[0].status).toBe("needs_review");
  });

  test("routes malformed executor results to manual review", async () => {
    const { deps, calls } = dependencies({
      execute: async () => ({ status: "succeeded", sideEffectCertainty: "unknown" } as any),
    });
    const result = await processOneExecutionJob(deps);
    expect(result.status).toBe("needs_review");
    expect(calls.finished[0].status).toBe("needs_review");
    expect(calls.finished[0].error).toContain("invalid result");
  });

  test("fails closed when executor result getters throw", async () => {
    const malformed = Object.defineProperties({}, {
      status: { enumerable: true, get() { throw new Error("untrusted status getter"); } },
      sideEffectCertainty: { enumerable: true, value: "effect_confirmed" },
    });
    const { deps, calls } = dependencies({ execute: async () => malformed as any });
    const result = await processOneExecutionJob(deps);
    expect(result.status).toBe("needs_review");
    expect(calls.finished[0].status).toBe("needs_review");
    expect(calls.finished[0].error).toContain("invalid result");
  });

  test("snapshots changing executor result getters only once", async () => {
    let reads = 0;
    const mutable = {
      get status() { reads++; return reads === 1 ? "succeeded" : "failed"; },
      get sideEffectCertainty() { return "effect_confirmed"; },
    };
    const { deps, calls } = dependencies({ execute: async () => mutable as any });
    const result = await processOneExecutionJob(deps);
    expect(result.status).toBe("succeeded");
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

  test("keeps uncertain effects in manual review even when marked non-retryable", async () => {
    const { deps, calls } = dependencies({
      execute: async () => ({
        status: "failed",
        sideEffectCertainty: "uncertain",
        retryable: false,
        error: "Provider timed out after request dispatch",
      }),
    });
    const result = await processOneExecutionJob(deps);
    expect(result.status).toBe("needs_review");
    expect(calls.finished[0].status).toBe("needs_review");
    expect(calls.finished[0].retryAt).toBeNull();
  });

  test("keeps confirmed effects in manual review even when marked non-retryable", async () => {
    const { deps, calls } = dependencies({
      execute: async () => ({
        status: "failed",
        sideEffectCertainty: "effect_confirmed",
        retryable: false,
        error: "Provider acknowledged the effect but returned a terminal error",
      }),
    });
    const result = await processOneExecutionJob(deps);
    expect(result.status).toBe("needs_review");
    expect(calls.finished[0].status).toBe("needs_review");
    expect(calls.finished[0].retryAt).toBeNull();
  });

  test("does not spin retries for permanent preflight/configuration failures", async () => {
    const { deps, calls } = dependencies({
      execute: async () => ({
        status: "failed",
        sideEffectCertainty: "not_attempted",
        retryable: false,
        error: "Gmail needs verification",
      }),
    });
    const result = await processOneExecutionJob(deps);
    expect(result.status).toBe("failed");
    expect(calls.finished[0].status).toBe("failed");
    expect(calls.finished[0].retryAt).toBeNull();
  });

  test("applies a default delay when a safe retry has no explicit retry time", async () => {
    const { deps, calls } = dependencies({
      execute: async () => ({
        status: "failed",
        sideEffectCertainty: "not_attempted",
        error: "Temporary failure",
      }),
    });
    const before = Date.now();
    const result = await processOneExecutionJob(deps);
    const retryAt = Date.parse(calls.finished[0].retryAt);
    expect(result.status).toBe("queued");
    expect(retryAt).toBeGreaterThanOrEqual(before + 4_000);
    expect(retryAt).toBeLessThanOrEqual(Date.now() + 6_000);
  });

  test("falls back to bounded backoff when executor retry time is invalid", async () => {
    const { deps, calls } = dependencies({
      execute: async () => ({
        status: "failed",
        sideEffectCertainty: "not_attempted",
        retryAt: "not-a-date",
        error: "Temporary failure",
      }),
    });
    const before = Date.now();
    const result = await processOneExecutionJob(deps);
    const retryAt = Date.parse(calls.finished[0].retryAt);
    expect(result.status).toBe("queued");
    expect(retryAt).toBeGreaterThanOrEqual(before + 4_000);
    expect(retryAt).toBeLessThanOrEqual(Date.now() + 6_000);
  });

  test("ignores non-string retry times from malformed executor results", async () => {
    const { deps, calls } = dependencies({
      execute: async () => ({
        status: "failed",
        sideEffectCertainty: "not_attempted",
        retryAt: { toString: () => "not-a-date" },
        error: "Temporary failure",
      } as any),
    });
    const result = await processOneExecutionJob(deps);
    expect(result.status).toBe("queued");
    expect(Number.isFinite(Date.parse(calls.finished[0].retryAt))).toBe(true);
  });

  test("drops retry timestamps when a job is routed to manual review", async () => {
    const { deps, calls } = dependencies({
      execute: async () => ({
        status: "failed",
        sideEffectCertainty: "uncertain",
        retryAt: new Date(Date.now() + 60_000).toISOString(),
        error: "Provider outcome is uncertain",
      }),
    });
    const result = await processOneExecutionJob(deps);
    expect(result.status).toBe("needs_review");
    expect(calls.finished[0].retryAt).toBeNull();
  });

  test("normalizes valid executor retry timestamps to ISO format", async () => {
    const { deps, calls } = dependencies({
      execute: async () => ({
        status: "failed",
        sideEffectCertainty: "not_attempted",
        retryAt: "2030-01-01T12:00:00+03:00",
        error: "Temporary failure",
      }),
    });
    const result = await processOneExecutionJob(deps);
    expect(result.status).toBe("queued");
    expect(calls.finished[0].retryAt).toBe("2030-01-01T09:00:00.000Z");
  });

  test("preserves scheduled retry time for transient lock contention", async () => {
    const retryAt = new Date(Date.now() + 30_000).toISOString();
    const { deps, calls } = dependencies({
      execute: async () => ({
        status: "failed",
        sideEffectCertainty: "not_attempted",
        retryable: true,
        retryAt,
        error: "Automation is busy",
      }),
    });
    const result = await processOneExecutionJob(deps);
    expect(result.status).toBe("queued");
    expect(calls.finished[0].retryAt).toBe(retryAt);
  });

  test("does not trust executor-asserted provider idempotency for uncertain effects", async () => {
    const { deps, calls } = dependencies({
      execute: async () => ({
        status: "failed",
        sideEffectCertainty: "uncertain",
        error: "Provider timeout",
        providerSupportsIdempotency: true,
      }),
    });
    const result = await processOneExecutionJob(deps);
    expect(result.status).toBe("needs_review");
    expect(calls.finished[0].status).toBe("needs_review");
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

  test("treats a truthy non-boolean heartbeat response as lease loss", async () => {
    let executeCalls = 0;
    const { deps, calls } = dependencies({
      heartbeat: async () => ({ alive: true } as any),
      execute: async (_job, context) => {
        executeCalls++;
        expect(await context.heartbeat()).toBe(false);
        return { status: "succeeded", sideEffectCertainty: "effect_confirmed" };
      },
    });

    expect(await processOneExecutionJob(deps)).toEqual({ outcome: "lease_lost", jobId: "job-1" });
    expect(executeCalls).toBe(1);
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

  test("fails closed when a thrown Error exposes a hostile message getter", async () => {
    const hostile = Object.create(Error.prototype);
    Object.defineProperty(hostile, "message", {
      get() { throw new Error("message getter must not escape"); },
    });
    const { deps, calls } = dependencies({
      execute: async () => { throw hostile; },
    });

    const result = await processOneExecutionJob(deps);
    expect(result).toEqual({ outcome: "finished", jobId: "job-1", status: "needs_review" });
    expect(calls.finished).toHaveLength(1);
    expect(calls.finished[0].status).toBe("needs_review");
    expect(calls.finished[0].error).toContain("unknown error");
  });

  test("redacts provider secrets before durable job finalization", async () => {
    const { deps, calls } = dependencies({
      execute: async () => ({
        status: "failed",
        sideEffectCertainty: "uncertain",
        error: "Provider timeout for https://provider.test/send?token=secret Bearer abc.def.ghi api_key=sk_live_123",
      }),
    });
    await processOneExecutionJob(deps);
    const persistedError = calls.finished[0].error;
    expect(persistedError).not.toContain("provider.test");
    expect(persistedError).not.toContain("token=secret");
    expect(persistedError).not.toContain("abc.def.ghi");
    expect(persistedError).not.toContain("sk_live_123");
    expect(persistedError).toContain("[REDACTED_URL]");
    expect(persistedError).toContain("[REDACTED_AUTH]");
    expect(persistedError).toContain("[REDACTED_SECRET]");
  });

  test("does not execute or finalize when claiming a job fails", async () => {
    let executeCalls = 0;
    let finishCalls = 0;
    const { deps } = dependencies({
      claim: async () => {
        throw new Error("queue database unavailable");
      },
      execute: async () => {
        executeCalls++;
        return { status: "succeeded", sideEffectCertainty: "effect_confirmed" };
      },
      finish: async () => {
        finishCalls++;
        return true;
      },
    });

    await expect(processOneExecutionJob(deps)).rejects.toThrow("queue database unavailable");
    expect(executeCalls).toBe(0);
    expect(finishCalls).toBe(0);
  });

  test("rejects truthy non-boolean finalization responses", async () => {
    for (const malformedResponse of ["true", 1, {}, { ok: true }]) {
      const { deps } = dependencies({ finish: async () => malformedResponse as any });
      expect(await processOneExecutionJob(deps)).toEqual({
        outcome: "finalization_rejected",
        jobId: "job-1",
      });
    }
  });

  test("reports rejected finalization instead of claiming success", async () => {
    const { deps } = dependencies({ finish: async () => false });
    expect(await processOneExecutionJob(deps)).toEqual({
      outcome: "finalization_rejected",
      jobId: "job-1",
    });
  });
});
