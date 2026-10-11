// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, test } from "bun:test";
import { sanitizeExecutionError, sanitizeExecutionAuditValue } from "../execution-error-sanitizer";

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

  test("redacts generic token and key assignments", () => {
    const result = sanitizeExecutionError(
      "Provider rejected request: token=raw-token private_key=private-material signing_key=signing-material",
      "safe fallback",
    );
    expect(result).not.toContain("raw-token");
    expect(result).not.toContain("private-material");
    expect(result).not.toContain("signing-material");
    expect(result.split("[REDACTED_SECRET]").length - 1).toBe(3);
  });

  test("uses fallback for empty and non-string errors", () => {
    expect(sanitizeExecutionError("", "safe fallback")).toBe("safe fallback");
    expect(sanitizeExecutionError({ message: "secret" }, "safe fallback")).toBe("safe fallback");
    expect(sanitizeExecutionError("[REDACTED_URL]", "safe fallback")).toBe("safe fallback");
  });

  test("normalizes line breaks and bounds audit text", () => {
    expect(sanitizeExecutionError("first\nsecond", "fallback")).toBe("first second");
    expect(sanitizeExecutionError("x".repeat(900), "fallback")).toHaveLength(500);
  });
});


describe("sanitizeExecutionAuditValue", () => {
  test("redacts nested secret fields and sanitizes string values", () => {
    const result = sanitizeExecutionAuditValue({
      access_token: "plain-token-value",
      nested: {
        password: "my-password",
        message: "Failed for https://provider.test/action?key=secret user@example.com",
        count: 2,
      },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("plain-token-value");
    expect(serialized).not.toContain("my-password");
    expect(serialized).not.toContain("provider.test");
    expect(serialized).not.toContain("user@example.com");
    expect(serialized).toContain("[REDACTED_SECRET]");
    expect(serialized).toContain("[REDACTED_URL]");
    expect(serialized).toContain("[REDACTED_EMAIL]");
  });

  test("redacts generic token, private key, and signing key properties", () => {
    const result = sanitizeExecutionAuditValue({
      token: "raw-token",
      private_key: "private-material",
      signing_key: "signing-material",
      safe: "visible",
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("raw-token");
    expect(serialized).not.toContain("private-material");
    expect(serialized).not.toContain("signing-material");
    expect(result).toMatchObject({
      token: "[REDACTED_SECRET]",
      private_key: "[REDACTED_SECRET]",
      signing_key: "[REDACTED_SECRET]",
      safe: "visible",
    });
  });

  test("bounds nested arrays, object entries, depth, and circular references", () => {
    const circular: Record<string, unknown> = { keep: "safe" };
    circular["self"] = circular;
    const result = sanitizeExecutionAuditValue({
      values: Array.from({ length: 80 }, (_, index) => index),
      circular,
      deep: { a: { b: { c: { d: { e: { f: { g: "too deep" } } } } } } },
    }) as Record<string, unknown>;
    expect((result["values"] as unknown[])).toHaveLength(50);
    expect(JSON.stringify(result)).toContain("[CIRCULAR]");
    expect(JSON.stringify(result)).toContain("[TRUNCATED]");
  });
});
