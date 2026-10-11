// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import {
  MAX_EXECUTION_JOB_PAYLOAD_BYTES,
  parseExecutionJobEnqueueResult,
  parseExecutionJobEnqueueResponse,
  validateExecutionJobEnqueueMetadata,
  validateExecutionJobPayload,
  validateExecutionJobRequestPayload,
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
      { ...valid(), availableAt: "2".repeat(101) },
    ];
    for (const request of invalidRequests) {
      expect(validateExecutionJobEnqueueMetadata(request).success).toBe(false);
    }
  });

  it("fails closed when metadata accessors throw", () => {
    const request = Object.defineProperties(valid(), {
      automationId: { enumerable: true, get() { throw new Error("untrusted getter"); } },
    });
    expect(validateExecutionJobEnqueueMetadata(request)).toEqual({
      success: false,
      error: "Execution job request contains invalid fields.",
    });
  });

  it("snapshots metadata accessors once before validating the RPC payload", () => {
    let reads = 0;
    const request = {
      ...valid(),
      get automationId() { reads++; return reads === 1 ? "automation-1" : "automation-spoofed"; },
    };
    const result = validateExecutionJobEnqueueMetadata(request);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.automationId).toBe("automation-1");
    expect(reads).toBe(1);
  });

  it("normalizes whitespace around automation and idempotency identifiers", () => {
    const result = validateExecutionJobEnqueueMetadata({
      automationId: " automation-1 ",
      triggerType: "manual",
      idempotencyKey: " request-1 ",
    });
    expect(result).toEqual({
      success: true,
      value: {
        automationId: "automation-1",
        triggerType: "manual",
        idempotencyKey: "request-1",
        maxAttempts: 3,
      },
    });
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

  it("rejects objects that serialize into a non-object JSON value", () => {
    expect(validateExecutionJobPayload(new Date("2030-01-01T00:00:00Z"))).toEqual({
      success: false,
      error: "Execution job payload must be a JSON object.",
    });
    expect(validateExecutionJobPayload({ toJSON: () => null })).toEqual({
      success: false,
      error: "Execution job payload must be a JSON object.",
    });
    expect(validateExecutionJobPayload({ toJSON: () => ["unexpected"] })).toEqual({
      success: false,
      error: "Execution job payload must be a JSON object.",
    });
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

describe("durable execution job request payload boundary", () => {
  it("snapshots the payload accessor once", () => {
    let reads = 0;
    const request = {
      get payload() {
        reads++;
        return reads === 1 ? { message: "safe" } : { message: "substituted" };
      },
    };
    expect(validateExecutionJobRequestPayload(request)).toEqual({
      success: true,
      payload: { message: "safe" },
    });
    expect(reads).toBe(1);
  });

  it("fails closed when reading the payload accessor throws", () => {
    const request = Object.defineProperty({}, "payload", {
      enumerable: true,
      get() { throw new Error("untrusted getter"); },
    });
    expect(validateExecutionJobRequestPayload(request)).toEqual({
      success: false,
      error: "Execution job payload must be valid JSON.",
    });
  });
});

describe("durable execution job enqueue RPC response validation", () => {
  it("accepts a known queue status and bounded non-empty identifier", () => {
    expect(parseExecutionJobEnqueueResult({ id: "job-1", status: "queued" })).toEqual({
      id: "job-1",
      status: "queued",
    });
    expect(parseExecutionJobEnqueueResult({ id: "job-2", status: "needs_review" }).status).toBe("needs_review");
  });

  it("snapshots enqueue response accessors once", () => {
    let idReads = 0;
    let statusReads = 0;
    const result = {
      get id() { idReads++; return idReads === 1 ? "job-1" : ""; },
      get status() { statusReads++; return statusReads === 1 ? "queued" : "invalid"; },
    };
    expect(parseExecutionJobEnqueueResult(result)).toEqual({ id: "job-1", status: "queued" });
    expect(idReads).toBe(1);
    expect(statusReads).toBe(1);
  });

  it("fails closed when enqueue response accessors throw", () => {
    const result = Object.defineProperties({}, {
      id: { enumerable: true, get() { throw new Error("untrusted getter"); } },
      status: { enumerable: true, value: "queued" },
    });
    expect(() => parseExecutionJobEnqueueResult(result)).toThrow("Queue enqueue returned no valid job.");
  });

  it("accepts exactly one row in the enqueue RPC response envelope", () => {
    expect(parseExecutionJobEnqueueResponse([{ id: "job-1", status: "queued" }])).toEqual({
      id: "job-1",
      status: "queued",
    });
  });

  it("rejects empty, multi-row, and non-array enqueue RPC envelopes", () => {
    for (const value of [null, {}, [], [{ id: "job-1", status: "queued" }, { id: "job-2", status: "queued" }]]) {
      expect(() => parseExecutionJobEnqueueResponse(value)).toThrow("Queue enqueue returned an unexpected response.");
    }
  });

  it("rejects malformed identifiers and unknown statuses", () => {
    const invalidRows = [
      null,
      [],
      { id: "", status: "queued" },
      { id: "x".repeat(201), status: "queued" },
      { id: "job-1", status: "complete" },
      { id: "job-1", status: 1 },
      { id: "job-1" },
    ];
    for (const row of invalidRows) {
      expect(() => parseExecutionJobEnqueueResult(row)).toThrow("Queue enqueue returned no valid job.");
    }
  });
});
