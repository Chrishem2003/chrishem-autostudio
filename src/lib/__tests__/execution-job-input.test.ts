// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import {
  MAX_EXECUTION_JOB_PAYLOAD_BYTES,
  validateExecutionJobEnqueueMetadata,
  validateExecutionJobPayload,
} from "../execution-job-input";

describe("durable execution job enqueue metadata validation", () => {
  const valid = () => ({ automationId: "automation-1", triggerType: "manual", idempotencyKey: "request-1" });

  it("normalizes defaults and accepts supported triggers", () => {
    for (const triggerType of ["manual", "scheduled", "webhook"]) {
      const result = validateExecutionJobEnqueueMetadata({ ...valid(), triggerType });
      expect(result.success).toBe(true);
      if (result.success) expect(result.value.maxAttempts).toBe(3);
    }
  });

  it("rejects malformed runtime metadata before the RPC boundary", () => {
    const invalidRequests = [
      null,
      { ...valid(), automationId: 12 },
      { ...valid(), automationId: "x".repeat(201) },
      { ...valid(), triggerType: "unknown" },
      { ...valid(), idempotencyKey: " " },
      { ...valid(), idempotencyKey: "x".repeat(201) },
      { ...valid(), requestedBy: { user: "spoofed" } },
      { ...valid(), requestedBy: "x".repeat(201) },
      { ...valid(), maxAttempts: 0 },
      { ...valid(), maxAttempts: 11 },
      { ...valid(), availableAt: { toString: () => "2030-01-01" } },
      { ...valid(), availableAt: "not-a-date" },
    ];
    for (const request of invalidRequests) {
      expect(validateExecutionJobEnqueueMetadata(request).success).toBe(false);
    }
  });

  it("preserves optional user and schedule metadata when valid", () => {
    const result = validateExecutionJobEnqueueMetadata({
      ...valid(), requestedBy: "user-1", maxAttempts: 5, availableAt: "2030-01-01T00:00:00Z",
    });
    expect(result).toEqual({
      success: true,
      value: {
        automationId: "automation-1", triggerType: "manual", idempotencyKey: "request-1",
        requestedBy: "user-1", maxAttempts: 5, availableAt: "2030-01-01T00:00:00Z",
      },
    });
  });
});

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
