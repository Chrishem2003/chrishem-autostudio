// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, test } from "bun:test";
import { sanitizeExecutionError } from "../execution-error-sanitizer";

describe("sanitizeExecutionError", () => {
  test("redacts authorization, key assignments, URLs, JWTs and email addresses", () => {
    const raw = "Request failed Bearer abc.def.ghi api_key=sk_live_123 https://provider.test/send?token=secret chris@example.com";
    const result = sanitizeExecutionError(raw, "safe fallback");
    expect(result).not.toContain("abc.def.ghi");
    expect(result).not.toContain("sk_live_123");
    expect(result).not.toContain("provider.test");
    expect(result).not.toContain("token=secret");
    expect(result).not.toContain("chris@example.com");
    expect(result).toContain("[REDACTED_AUTH]");
    expect(result).toContain("[REDACTED_SECRET]");
    expect(result).toContain("[REDACTED_URL]");
    expect(result).toContain("[REDACTED_EMAIL]");
  });

  test("uses fallback for empty and non-string errors", () => {
    expect(sanitizeExecutionError("", "safe fallback")).toBe("safe fallback");
    expect(sanitizeExecutionError({ message: "secret" }, "safe fallback")).toBe("safe fallback");
    expect(sanitizeExecutionError("[REDACTED_URL]", "safe fallback")).toBe("safe fallback");
  });

  test("normalizes line breaks and bounds audit text", () => {
    expect(sanitizeExecutionError("first\\nsecond", "fallback")).toBe("first second");
    expect(sanitizeExecutionError("x".repeat(900), "fallback")).toHaveLength(500);
  });
});
