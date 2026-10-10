// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { MAX_EXECUTION_JOB_PAYLOAD_BYTES, validateExecutionJobPayload } from "../execution-job-input";

describe("durable execution job payload validation", () => {
  it("defaults an omitted payload to an empty object", () => {
    expect(validateExecutionJobPayload(undefined)).toEqual({ success: true, payload: {} });
  });

  it("accepts bounded JSON objects and returns a JSON-normalized payload", () => {
    expect(validateExecutionJobPayload({ triggerType: "manual", metadata: { source: "studio" } })).toEqual({
      success: true,
      payload: { triggerType: "manual", metadata: { source: "studio" } },
    });
  });

  it("rejects null, arrays, and primitive payloads", () => {
    for (const value of [null, [], "manual", 3, true]) {
      expect(validateExecutionJobPayload(value).success).toBe(false);
    }
  });

  it("rejects payloads above the 16 KiB UTF-8 boundary", () => {
    const oversized = { text: "x".repeat(MAX_EXECUTION_JOB_PAYLOAD_BYTES) };
    const result = validateExecutionJobPayload(oversized);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/16 KiB/i);
  });

  it("counts UTF-8 bytes rather than JavaScript characters", () => {
    const multibyte = { text: "é".repeat(9_000) };
    const result = validateExecutionJobPayload(multibyte);
    expect(result.success).toBe(false);
  });

  it("rejects cyclic payloads rather than throwing an opaque serialization error", () => {
    const cyclic = {};
    cyclic.self = cyclic;
    expect(validateExecutionJobPayload(cyclic)).toEqual({
      success: false,
      error: "Execution job payload must be valid JSON.",
    });
  });
});
