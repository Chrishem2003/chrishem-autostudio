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

  test("allows uncertain retry only with verified provider idempotency and stable key", () => {
    expect(decideExecutionRetry({
      sideEffectCertainty: "uncertain",
      attempts: 1,
      maxAttempts: 3,
      providerSupportsIdempotency: true,
      stableIdempotencyKey: "automation-123:job-456",
    }).status).toBe("queued");
  });

  test("does not accept a missing key as idempotency protection", () => {
    expect(decideExecutionRetry({
      sideEffectCertainty: "uncertain",
      attempts: 1,
      maxAttempts: 3,
      providerSupportsIdempotency: true,
      stableIdempotencyKey: "  ",
    }).status).toBe("needs_review");
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

  test("rejects invalid attempt counters", () => {
    expect(() => decideExecutionRetry({
      sideEffectCertainty: "not_attempted",
      attempts: 0,
      maxAttempts: 3,
    })).toThrow("attempts must be a positive integer");
  });

  test("rejects unsupported maximum attempts", () => {
    expect(() => decideExecutionRetry({
      sideEffectCertainty: "not_attempted",
      attempts: 1,
      maxAttempts: 11,
    })).toThrow("maxAttempts must be an integer between 1 and 10");
  });
});
