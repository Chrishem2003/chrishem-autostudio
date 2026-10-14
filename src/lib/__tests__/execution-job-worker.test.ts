// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, test } from "bun:test";
import { processOneExecutionJob } from "../execution-job-worker";

const job = {
  id: "job-1",
  automationId: "automation-1",
  triggerType: "manual",
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
  test("fails closed when claimed envelope access or payload traversal throws", async () => {
    const hostileEnvelope = { ...job };
    Object.defineProperty(hostileEnvelope, "payload", {
      enumerable: true,
      get() { throw new Error("hostile payload getter"); },
    });
    const hostileNestedPayload = {};
    Object.defineProperty(hostileNestedPayload, "secret", {
      enumerable: true,
      get() { throw new Error("hostile nested payload getter"); },
    });
    const cyclicPayload: any = {};
    cyclicPayload.self = cyclicPayload;

    for (const malformedClaim of [
      hostileEnvelope,
      { ...job, payload: hostileNestedPayload },
      { ...job, payload: new Date() },
      { ...job, payload: new Map([["action", "send"]]) },
      { ...job, payload: { amount: Number.POSITIVE_INFINITY } },
      { ...job, payload: { nested: 1n } },
      { ...job, payload: cyclicPayload },
    ]) {
      let executeCalls = 0;
      let finishCalls = 0;
      const { deps } = dependencies({
        claim: async () => malformedClaim as any,
        execute: async () => {
          executeCalls++;
          return { status: "succeeded", sideEffectCertainty: "effect_confirmed" };
        },
        finish: async () => {
          finishCalls++;
          return true;
        },
      });

      expect(await processOneExecutionJob(deps)).toEqual({
        outcome: "finalization_rejected",
        jobId: "unknown-claimed-job",
      });
      expect(executeCalls).toBe(0);
      expect(finishCalls).toBe(0);
    }
  });

  test("returns empty when no job is ready", async () => {
    const { deps } = dependencies({ claim: async () => null });
    expect(await processOneExecutionJob(deps)).toEqual({ outcome: "empty" });
  });

  test("does not let executor mutation change the claimed identity used for heartbeat/finalization", async () => {
    const seen = { heartbeat: [], finish: [] };
    const { deps, calls } = dependencies({
      claim: async () => ({
        ...job,
        payload: { request: { recipient: "approved@example.test" } },
      }),
      heartbeat: async (claimed) => {
        seen.heartbeat.push({ id: claimed.id, workerToken: claimed.workerToken });
        return true;
      },
      execute: async (claimed, context) => {
        expect(Reflect.set(claimed, "id", "spoofed-job")).toBe(false);
        expect(Reflect.set(claimed, "workerToken", "spoofed-token")).toBe(false);
        expect(Reflect.set((claimed.payload as any).request, "recipient", "attacker@example.test")).toBe(false);
        expect((claimed.payload as any).request.recipient).toBe("approved@example.test");
        await context.heartbeat();
        return { status: "succeeded", sideEffectCertainty: "effect_confirmed" };
      },
      finish: async (claimed, status, error, retryAt) => {
        seen.finish.push({ id: claimed.id, workerToken: claimed.workerToken });
        calls.finished.push({ status, error, retryAt });
        return true;
      },
    });

    const result = await processOneExecutionJob(deps);
    expect(result).toEqual({ outcome: "finished", jobId: "job-1", status: "succeeded" });
    // The worker confirms ownership before entering executor code, then the
    // executor's explicit heartbeat uses the same immutable claim identity.
    expect(seen.heartbeat).toEqual([
      { id: "job-1", workerToken: "token-1" },
      { id: "job-1", workerToken: "token-1" },
    ]);
    expect(seen.finish).toEqual([{ id: "job-1", workerToken: "token-1" }]);
  });

  test("does not execute when claimed retry metadata violates the queue contract", async () => {
    for (const invalidCounters of [
      { attempts: 0, maxAttempts: 3 },
      { attempts: 1, maxAttempts: 11 },
      { attempts: 4, maxAttempts: 3 },
      { attempts: 1.5, maxAttempts: 3 },
    ]) {
      let executeCalls = 0;
      const { deps, calls } = dependencies({
        claim: async () => ({ ...job, ...invalidCounters }),
        execute: async () => {
          executeCalls++;
          return { status: "succeeded", sideEffectCertainty: "effect_confirmed" };
        },
      });

      const result = await processOneExecutionJob(deps);
      expect(result).toEqual({ outcome: "finished", jobId: "job-1", status: "needs_review" });
      expect(executeCalls).toBe(0);
      expect(calls.finished).toHaveLength(1);
      expect(calls.finished[0].status).toBe("needs_review");
      expect(calls.finished[0].retryAt).toBeNull();
    }
  });

  test("reports rejected finalization when invalid claim metadata cannot be recorded", async () => {
    let executeCalls = 0;
    const { deps } = dependencies({
      claim: async () => ({ ...job, attempts: 0 }),
      execute: async () => {
        executeCalls++;
        return { status: "succeeded", sideEffectCertainty: "effect_confirmed" };
      },
      finish: async () => false,
    });

    expect(await processOneExecutionJob(deps)).toEqual({
      outcome: "finalization_rejected",
      jobId: "job-1",
    });
    expect(executeCalls).toBe(0);
  });

  test("does not execute jobs with unsupported trigger or malformed idempotency keys", async () => {
    for (const invalidMetadata of [
      { triggerType: "internal" },
      { idempotencyKey: "" },
      { idempotencyKey: " ".repeat(201) },
    ]) {
      let executeCalls = 0;
      const { deps, calls } = dependencies({
        claim: async () => ({ ...job, triggerType: "manual", ...invalidMetadata }),
        execute: async () => {
          executeCalls++;
          return { status: "succeeded", sideEffectCertainty: "effect_confirmed" };
        },
      });
      const result = await processOneExecutionJob(deps);
      expect(result).toEqual({ outcome: "finished", jobId: "job-1", status: "needs_review" });
      expect(executeCalls).toBe(0);
      expect(calls.finished).toHaveLength(1);
      expect(calls.finished[0].status).toBe("needs_review");
    }
  });

  test("rejects oversized claim identity fields before executing or finalizing", async () => {
    for (const invalidIdentity of [
      { id: "j".repeat(201) },
      { automationId: "a".repeat(201) },
      { workerToken: "t".repeat(201) },
    ]) {
      let executeCalls = 0;
      let finishCalls = 0;
      const { deps } = dependencies({
        claim: async () => ({ ...job, ...invalidIdentity }),
        execute: async () => {
          executeCalls++;
          return { status: "succeeded", sideEffectCertainty: "effect_confirmed" };
        },
        finish: async () => {
          finishCalls++;
          return true;
        },
      });

      expect(await processOneExecutionJob(deps)).toEqual({
        outcome: "finalization_rejected",
        jobId: "unknown-claimed-job",
      });
      expect(executeCalls).toBe(0);
      expect(finishCalls).toBe(0);
    }
  });

  test("does not finalize a claim with an unusable fencing identity", async () => {
    let executeCalls = 0;
    const { deps, calls } = dependencies({
      claim: async () => ({ ...job, workerToken: "" }),
      execute: async () => {
        executeCalls++;
        return { status: "succeeded", sideEffectCertainty: "effect_confirmed" };
      },
    });
    expect(await processOneExecutionJob(deps)).toEqual({
      outcome: "finalization_rejected",
      jobId: "unknown-claimed-job",
    });
    expect(executeCalls).toBe(0);
    expect(calls.finished).toHaveLength(0);
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

  test("normalizes a reasonable executor retry timestamp to ISO format", async () => {
    const retryAt = new Date(Date.now() + 3 * 60 * 60 * 1_000 + 30_000).toISOString().replace("Z", "+03:00");
    const expected = new Date(retryAt).toISOString();
    const { deps, calls } = dependencies({
      execute: async () => ({
        status: "failed",
        sideEffectCertainty: "not_attempted",
        retryAt,
        error: "Temporary failure",
      }),
    });
    const result = await processOneExecutionJob(deps);
    expect(result.status).toBe("queued");
    expect(calls.finished[0].retryAt).toBe(expected);
  });

  test("falls back to bounded backoff when an executor retry timestamp is in the past", async () => {
    const { deps, calls } = dependencies({
      execute: async () => ({
        status: "failed",
        sideEffectCertainty: "not_attempted",
        retryAt: new Date(Date.now() - 60_000).toISOString(),
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

  test("caps executor retry timestamps at 24 hours", async () => {
    const { deps, calls } = dependencies({
      execute: async () => ({
        status: "failed",
        sideEffectCertainty: "not_attempted",
        retryAt: "2030-01-01T12:00:00.000Z",
        error: "Provider requested a long delay",
      }),
    });
    const before = Date.now();
    const result = await processOneExecutionJob(deps);
    const retryAt = Date.parse(calls.finished[0].retryAt);
    expect(result.status).toBe("queued");
    expect(retryAt).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1_000 - 1_000);
    expect(retryAt).toBeLessThanOrEqual(Date.now() + 24 * 60 * 60 * 1_000);
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

  test("does not finalize a success if ownership is lost during execution", async () => {
    let heartbeatCalls = 0;
    let executeCalls = 0;
    const { deps, calls } = dependencies({
      heartbeat: async () => {
        heartbeatCalls++;
        return heartbeatCalls === 1;
      },
      execute: async (_job, context) => {
        executeCalls++;
        expect(await context.heartbeat()).toBe(false);
        return { status: "succeeded", sideEffectCertainty: "effect_confirmed" };
      },
    });

    expect(await processOneExecutionJob(deps)).toEqual({
      outcome: "lease_lost",
      jobId: "job-1",
    });
    expect(executeCalls).toBe(1);
    expect(heartbeatCalls).toBe(2);
    expect(calls.finished).toHaveLength(0);
  });

  test("does not finalize when an in-execution heartbeat transport fails", async () => {
    let heartbeatCalls = 0;
    const { deps, calls } = dependencies({
      heartbeat: async () => {
        heartbeatCalls++;
        if (heartbeatCalls === 2) throw new Error("database connection lost");
        return true;
      },
      execute: async (_job, context) => {
        expect(await context.heartbeat()).toBe(false);
        return { status: "succeeded", sideEffectCertainty: "effect_confirmed" };
      },
    });

    expect(await processOneExecutionJob(deps)).toEqual({
      outcome: "lease_lost",
      jobId: "job-1",
    });
    expect(heartbeatCalls).toBe(2);
    expect(calls.finished).toHaveLength(0);
  });

  test("does not enter executor code when heartbeat returns a truthy non-boolean", async () => {
    let executeCalls = 0;
    const { deps, calls } = dependencies({
      heartbeat: async () => ({ alive: true } as any),
      execute: async () => {
        executeCalls++;
        return { status: "succeeded", sideEffectCertainty: "effect_confirmed" };
      },
    });

    expect(await processOneExecutionJob(deps)).toEqual({ outcome: "lease_lost", jobId: "job-1" });
    expect(executeCalls).toBe(0);
    expect(calls.finished).toHaveLength(0);
  });

  test("does not enter executor code when the initial heartbeat transport throws", async () => {
    let executeCalls = 0;
    const { deps, calls } = dependencies({
      execute: async () => {
        executeCalls++;
        return { status: "succeeded", sideEffectCertainty: "effect_confirmed" };
      },
      heartbeat: async () => { throw new Error("database unavailable"); },
    });
    expect(await processOneExecutionJob(deps)).toEqual({ outcome: "lease_lost", jobId: "job-1" });
    expect(executeCalls).toBe(0);
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

  test("does not replay work when finalization committed but its response was lost", async () => {
    let executeCalls = 0;
    let finishCalls = 0;
    let persistedStatus = "running";
    const { deps } = dependencies({
      execute: async () => {
        executeCalls++;
        return {
          status: "succeeded",
          sideEffectCertainty: "effect_confirmed",
        };
      },
      finish: async (_job, status) => {
        finishCalls++;
        // Model the server commit succeeding before the transport drops its response.
        persistedStatus = status;
        throw new Error("connection reset after commit");
      },
    });

    expect(await processOneExecutionJob(deps)).toEqual({
      outcome: "finalization_rejected",
      jobId: "job-1",
    });
    expect(persistedStatus).toBe("succeeded");
    expect(executeCalls).toBe(1);
    expect(finishCalls).toBe(1);
  });

  test("treats an explicit rejected finalization as unknown and never reruns within the same worker call", async () => {
    let executeCalls = 0;
    let finishCalls = 0;
    const { deps } = dependencies({
      execute: async () => {
        executeCalls++;
        return {
          status: "failed",
          sideEffectCertainty: "uncertain",
          error: "Provider may have accepted the request",
        };
      },
      finish: async () => {
        finishCalls++;
        return false;
      },
    });

    expect(await processOneExecutionJob(deps)).toEqual({
      outcome: "finalization_rejected",
      jobId: "job-1",
    });
    expect(executeCalls).toBe(1);
    expect(finishCalls).toBe(1);
  });


  test("fails closed when an executor result getter throws", async () => {
    for (const field of ["status", "sideEffectCertainty", "error", "retryAt", "retryable"]) {
      let executeCalls = 0;
      const malformedResult: Record<string, unknown> = {};
      Object.defineProperty(malformedResult, field, {
        enumerable: true,
        get() { throw new Error("hostile executor result getter"); },
      });
      // Provide the other required fields so the selected getter is reached
      // during the worker's runtime-boundary snapshot.
      if (field !== "status") malformedResult.status = "failed";
      if (field !== "sideEffectCertainty") malformedResult.sideEffectCertainty = "uncertain";
      const { deps, calls } = dependencies({
        execute: async () => {
          executeCalls++;
          return malformedResult as any;
        },
      });

      const result = await processOneExecutionJob(deps);
      expect(result).toEqual({ outcome: "finished", jobId: "job-1", status: "needs_review" });
      expect(executeCalls).toBe(1);
      expect(calls.finished).toHaveLength(1);
      expect(calls.finished[0].status).toBe("needs_review");
      expect(calls.finished[0].retryAt).toBeNull();
    }
  });

  test("snapshots each executor result property once before making a finalization decision", async () => {
    const reads: Record<string, number> = {
      status: 0,
      sideEffectCertainty: 0,
      error: 0,
      retryAt: 0,
      retryable: 0,
    };
    const resultEnvelope = {};
    const values: Record<string, unknown> = {
      status: "succeeded",
      sideEffectCertainty: "effect_confirmed",
      error: null,
      retryAt: "2030-01-01T00:00:00.000Z",
      retryable: false,
    };
    for (const [field, value] of Object.entries(values)) {
      Object.defineProperty(resultEnvelope, field, {
        enumerable: true,
        get() {
          reads[field]++;
          return reads[field] === 1 ? value : (field === "status" ? "failed" : "uncertain");
        },
      });
    }

    const { deps, calls } = dependencies({
      execute: async () => resultEnvelope as any,
    });
    expect(await processOneExecutionJob(deps)).toEqual({
      outcome: "finished",
      jobId: "job-1",
      status: "succeeded",
    });
    expect(reads).toEqual({
      status: 1,
      sideEffectCertainty: 1,
      error: 1,
      retryAt: 1,
      retryable: 1,
    });
    expect(calls.finished).toHaveLength(1);
    expect(calls.finished[0].status).toBe("succeeded");
  });

});
