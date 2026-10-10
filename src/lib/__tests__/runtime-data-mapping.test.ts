// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { resolveStepConfig } from "../runtime-data-mapping";

describe("resolveStepConfig", () => {
  it("resolves explicit scalar fields from completed prior steps", () => {
    const result = resolveStepConfig(
      { to: "{{steps.trigger-1.email}}", body: "Hello {{steps.ai_step.summary}} ({{steps.ai_step.count}})" },
      { "trigger-1": { email: "person@example.com" }, ai_step: { summary: "Report ready", count: 3 } },
    );
    expect(result).toEqual({
      ok: true,
      config: { to: "person@example.com", body: "Hello Report ready (3)" },
    });
  });

  it("fails closed when a referenced step or field is missing", () => {
    const result = resolveStepConfig({ to: "{{steps.unknown.email}}" }, {});
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Missing or unsupported step output/);
  });

  it("rejects malformed or unsupported token syntax", () => {
    const result = resolveStepConfig({ body: "{{steps.trigger-1.email|fallback}}" }, {
      "trigger-1": { email: "person@example.com" },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid or unsupported data token/i);
  });

  it("does not stringify nested provider payloads", () => {
    const result = resolveStepConfig({ body: "{{steps.http.response}}" }, {
      http: { response: { token: "must-not-leak" } },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unsupported/i);
  });

  it("supports false and zero without treating them as missing", () => {
    const result = resolveStepConfig({ body: "{{steps.check.allowed}}:{{steps.check.count}}" }, {
      check: { allowed: false, count: 0 },
    });
    expect(result).toEqual({ ok: true, config: { body: "false:0" } });
  });

  it("rejects oversized resolved values", () => {
    const result = resolveStepConfig({ body: "{{steps.ai.summary}}" }, {
      ai: { summary: "x".repeat(8_001) },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/safety limit/);
  });
});
