// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, test } from "bun:test";
import { decideExecutionRetry } from "../execution-job-policy";

describe("decideExecutionRetry", () => {
  test("requeues work known not to have started", () => {
    expect(decideExecutionRetry({
      sideEffectCertainty: "not_attempted",
      attempts: 1,
      maxAttempts: 3,
    }).status).toBe("queued");
  });

  test("requeues a confirmed no-effect failure while attempts remain", () => {
    expect(decideExecutionRetry({
      sideEffectCertainty: "confirmed_no_effect",
      attempts: 2,
      maxAttempts: 3,
    }).retryAllowed).toBe(true);
  });

  test("sends uncertain effects to review by default", () => {
    const decision = decideExecutionRetry({
      sideEffectCertainty: "uncertain",
      attempts: 1,
      maxAttempts: 3,
    });
    expect(decision.status).toBe("needs_review");
    expect(decision.retryAllowed).toBe(false);
  });

  test("never retries uncertain effects based on caller-provided idempotency claims", () => {
    const decision = decideExecutionRetry({
      sideEffectCertainty: "uncertain",
      attempts: 1,
      maxAttempts: 3,
      providerSupportsIdempotency: true,
      stableIdempotencyKey: "automation-123:job-456",
    } as any);
    expect(decision.status).toBe("needs_review");
    expect(decision.retryAllowed).toBe(false);
  });

  test("fails closed when side-effect certainty is malformed", () => {
    const decision = decideExecutionRetry({
      sideEffectCertainty: "sometimes" as any,
      attempts: 1,
      maxAttempts: 3,
    });
    expect(decision.status).toBe("needs_review");
    expect(decision.retryAllowed).toBe(false);
  });

  test("does not repeat an already confirmed side effect", () => {
    expect(decideExecutionRetry({
      sideEffectCertainty: "effect_confirmed",
      attempts: 1,
      maxAttempts: 3,
    }).status).toBe("needs_review");
  });

  test("dead-letters safe retry when the attempt limit is reached", () => {
    expect(decideExecutionRetry({
      sideEffectCertainty: "not_attempted",
      attempts: 3,
      maxAttempts: 3,
    }).status).toBe("dead_letter");
  });

  test("routes invalid attempt counters to review without throwing", () => {
    for (const attempts of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const decision = decideExecutionRetry({
        sideEffectCertainty: "not_attempted",
        attempts,
        maxAttempts: 3,
      });
      expect(decision.status).toBe("needs_review");
      expect(decision.retryAllowed).toBe(false);
    }
  });

  test("routes invalid retry limits and inconsistent counters to review", () => {
    for (const maxAttempts of [0, -1, 1.5, 11, Number.NaN, Number.POSITIVE_INFINITY]) {
      const decision = decideExecutionRetry({
        sideEffectCertainty: "confirmed_no_effect",
        attempts: 1,
        maxAttempts,
      });
      expect(decision.status).toBe("needs_review");
      expect(decision.retryAllowed).toBe(false);
    }

    const inconsistent = decideExecutionRetry({
      sideEffectCertainty: "not_attempted",
      attempts: 4,
      maxAttempts: 3,
    });
    expect(inconsistent.status).toBe("needs_review");
    expect(inconsistent.retryAllowed).toBe(false);
  });

  test("fails closed when a retry-policy field getter throws", () => {
    const input = {
      get sideEffectCertainty() {
        throw new Error("hostile getter");
      },
      attempts: 1,
      maxAttempts: 3,
    };
    const decision = decideExecutionRetry(input as any);
    expect(decision.status).toBe("needs_review");
    expect(decision.retryAllowed).toBe(false);
  });

  test("snapshots retry-policy getters only once", () => {
    let certaintyReads = 0;
    const input = {
      get sideEffectCertainty() {
        certaintyReads++;
        return certaintyReads === 1 ? "confirmed_no_effect" : "uncertain";
      },
      attempts: 1,
      maxAttempts: 3,
    };
    const decision = decideExecutionRetry(input as any);
    expect(decision.status).toBe("queued");
    expect(certaintyReads).toBe(1);
  });


  test("fails closed when an attempt-counter getter throws", () => {
    const input = {
      sideEffectCertainty: "not_attempted",
      get attempts() {
        throw new Error("hostile attempts getter");
      },
      maxAttempts: 3,
    };
    const decision = decideExecutionRetry(input as any);
    expect(decision.status).toBe("needs_review");
    expect(decision.retryAllowed).toBe(false);
  });

  test("snapshots each attempt counter only once", () => {
    let attemptsReads = 0;
    let maxAttemptsReads = 0;
    const input = {
      sideEffectCertainty: "not_attempted",
      get attempts() {
        attemptsReads++;
        return attemptsReads === 1 ? 1 : 3;
      },
      get maxAttempts() {
        maxAttemptsReads++;
        return maxAttemptsReads === 1 ? 3 : 1;
      },
    };
    const decision = decideExecutionRetry(input as any);
    expect(decision.status).toBe("queued");
    expect(attemptsReads).toBe(1);
    expect(maxAttemptsReads).toBe(1);
  });

});
