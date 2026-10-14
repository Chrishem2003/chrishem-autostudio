// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, test } from "bun:test";
import { isValidExecutionLeaseToken } from "@/lib/execution-lease-token";

describe("isValidExecutionLeaseToken", () => {
  test("accepts a bounded opaque token", () => {
    expect(isValidExecutionLeaseToken("lease-token_123")).toBe(true);
  });

  test("rejects malformed runtime values and unbounded tokens", () => {
    for (const value of [null, undefined, false, 1, {}, "", "   ", "token with spaces", "x".repeat(201)]) {
      expect(isValidExecutionLeaseToken(value)).toBe(false);
    }
  });

  test("accepts the documented maximum length", () => {
    expect(isValidExecutionLeaseToken("x".repeat(200))).toBe(true);
  });
});
