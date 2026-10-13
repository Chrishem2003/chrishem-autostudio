// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { runScheduledEnqueueAttempt, shouldReleaseScheduledLease } from "../scheduled-enqueue-attempt";

describe("runScheduledEnqueueAttempt", () => {
  it("does not advance the schedule marker when enqueue fails", async () => {
    let markerAdvance: boolean | null = null;
    const result = await runScheduledEnqueueAttempt({
      enqueue: async () => { throw new Error("queue unavailable"); },
      release: async (enqueueSucceeded) => { markerAdvance = enqueueSucceeded; },
    });

    expect(result).toEqual({ enqueueSucceeded: false, releaseSucceeded: true });
    expect(markerAdvance).toBe(false);
  });

  it("advances the schedule marker only after enqueue succeeds", async () => {
    let markerAdvance: boolean | null = null;
    const result = await runScheduledEnqueueAttempt({
      enqueue: async () => ({ id: "job-1" }),
      release: async (enqueueSucceeded) => { markerAdvance = enqueueSucceeded; },
    });

    expect(result).toEqual({ enqueueSucceeded: true, releaseSucceeded: true });
    expect(markerAdvance).toBe(true);
  });

  it("still attempts lease release after enqueue failure", async () => {
    let releaseCalls = 0;
    const result = await runScheduledEnqueueAttempt({
      enqueue: async () => { throw new Error("queue unavailable"); },
      release: async () => { releaseCalls += 1; },
    });

    expect(releaseCalls).toBe(1);
    expect(result.releaseSucceeded).toBe(true);
  });

  it("retains the lease after an ambiguous first-generation enqueue failure", () => {
    expect(shouldReleaseScheduledLease({ enqueueSucceeded: false, lastRunAt: null })).toBe(false);
    expect(shouldReleaseScheduledLease({ enqueueSucceeded: false, lastRunAt: undefined })).toBe(false);
  });

  it("allows release after a failed enqueue when a prior cursor preserves the generation", () => {
    expect(shouldReleaseScheduledLease({
      enqueueSucceeded: false,
      lastRunAt: "2026-10-11T05:00:00.000Z",
    })).toBe(true);
  });

  it("allows release after successful enqueue even for the initial generation", () => {
    expect(shouldReleaseScheduledLease({ enqueueSucceeded: true, lastRunAt: null })).toBe(true);
  });

  it("reports release failure separately after a successful enqueue", async () => {
    const result = await runScheduledEnqueueAttempt({
      enqueue: async () => ({ id: "job-1" }),
      release: async () => { throw new Error("database unavailable"); },
    });

    expect(result).toEqual({ enqueueSucceeded: true, releaseSucceeded: false });
  });
});
