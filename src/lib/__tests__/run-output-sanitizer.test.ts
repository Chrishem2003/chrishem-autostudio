// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, test } from "bun:test";
import { sanitizeRunOutput } from "../run-output-sanitizer";

describe("sanitizeRunOutput", () => {
  test("redacts secret-like keys recursively", () => {
    expect(sanitizeRunOutput({
      result: {
        headers: { Authorization: "Bearer secret", "api_key": "private-key" },
        nested: [{ refresh_token: "refresh-secret" }],
      },
    })).toEqual({
      result: {
        headers: { Authorization: "[redacted]", api_key: "[redacted]" },
        nested: [{ refresh_token: "[redacted]" }],
      },
    });
  });

  test("redacts bearer credentials, URLs and email addresses in strings", () => {
    const result = sanitizeRunOutput({
      detail: "Request https://provider.example/send?token=secret for person@example.com with Bearer abc.def.ghi",
    });
    expect(result.detail).not.toContain("provider.example");
    expect(result.detail).not.toContain("person@example.com");
    expect(result.detail).not.toContain("abc.def.ghi");
    expect(result.detail).toContain("[REDACTED_URL]");
    expect(result.detail).toContain("[REDACTED_EMAIL]");
    expect(result.detail).toContain("[REDACTED_AUTH]");
  });

  test("bounds nested collection size, depth, and strings", () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: "hidden" } } } } } } };
    expect(sanitizeRunOutput(deep).a.b.c.d.e.f).toBe("[MAX_DEPTH]");
    expect(sanitizeRunOutput({ value: "x".repeat(900) }).value).toHaveLength(500);
    expect(sanitizeRunOutput({ list: Array.from({ length: 55 }, (_, i) => i) }).list).toHaveLength(51);
  });

  test("redacts credentials embedded in ordinary output strings", () => {
    const result = sanitizeRunOutput({
      detail: "api_key=sk_live_123 password=hunter2 client_secret:very-secret",
      authorization: "Bearer hidden",
    });
    expect(result.detail).not.toContain("sk_live_123");
    expect(result.detail).not.toContain("hunter2");
    expect(result.detail).not.toContain("very-secret");
    expect(result.detail).toContain("[REDACTED_SECRET]");
    expect(result.authorization).toBe("[redacted]");
  });

  test("omits unsupported runtime values", () => {
    expect(sanitizeRunOutput({ value: undefined, fn: () => "secret" })).toEqual({
      value: "[omitted]",
      fn: "[omitted]",
    });
  });
});
