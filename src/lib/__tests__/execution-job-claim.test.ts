// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, test } from "bun:test";
import { parseClaimedExecutionJob, parseClaimedExecutionJobResponse } from "../execution-job-claim";

const validRow = () => ({
  id: "job-1",
  automation_id: "automation-1",
  trigger_type: "manual",
  payload: { greeting: "hello" },
  attempts: 1,
  max_attempts: 3,
  worker_token: "lease-token",
  idempotency_key: "automation-1:job-1",
});

describe("parseClaimedExecutionJobResponse", () => {
  test("treats an empty array as no available job", () => {
    expect(parseClaimedExecutionJobResponse([])).toBeNull();
  });

  test("accepts exactly one valid claimed row", () => {
    expect(parseClaimedExecutionJobResponse([validRow()])).toEqual(parseClaimedExecutionJob(validRow()));
  });

  test("rejects malformed envelopes and multiple claimed rows", () => {
    for (const value of [null, "job", 42, {}]) {
      expect(() => parseClaimedExecutionJobResponse(value)).toThrow("unexpected response");
    }
    expect(() => parseClaimedExecutionJobResponse([validRow(), validRow()])).toThrow("multiple job rows");
  });
});

describe("parseClaimedExecutionJob", () => {
  test("normalizes a valid database claim", () => {
    expect(parseClaimedExecutionJob(validRow())).toEqual({
      id: "job-1",
      automationId: "automation-1",
      triggerType: "manual",
      payload: { greeting: "hello" },
      attempts: 1,
      maxAttempts: 3,
      workerToken: "lease-token",
      idempotencyKey: "automation-1:job-1",
    });
  });

  test("preserves the authoritative trigger type from the database row", () => {
    for (const trigger_type of ["manual", "scheduled", "webhook"]) {
      expect(parseClaimedExecutionJob({ ...validRow(), trigger_type }).triggerType).toBe(trigger_type);
    }
  });

  test("snapshots claim row accessors once before returning normalized fields", () => {
    let idReads = 0;
    const row = {
      ...validRow(),
      get id() { idReads++; return idReads === 1 ? "job-1" : "spoofed-job"; },
    };
    expect(parseClaimedExecutionJob(row).id).toBe("job-1");
    expect(idReads).toBe(1);
  });

  test("fails closed when claim row accessors throw", () => {
    const row = Object.defineProperties(validRow(), {
      worker_token: { enumerable: true, get() { throw new Error("untrusted getter"); } },
    });
    expect(() => parseClaimedExecutionJob(row)).toThrow("Queue claim row contains invalid fields.");
  });

  test("rejects missing or unsupported trigger types before execution", () => {
    for (const trigger_type of [undefined, null, "schedule", "unknown"]) {
      expect(() => parseClaimedExecutionJob({ ...validRow(), trigger_type })).toThrow("missing required fields");
    }
  });

  test("rejects a missing or undefined payload instead of applying enqueue defaults", () => {
    const missing = validRow();
    delete missing.payload;
    expect(() => parseClaimedExecutionJob(missing)).toThrow("invalid payload");
    expect(() => parseClaimedExecutionJob({ ...validRow(), payload: undefined })).toThrow("invalid payload");
  });

  test("rejects null, arrays, and non-object RPC results", () => {
    for (const value of [null, [], "job", 42]) {
      expect(() => parseClaimedExecutionJob(value)).toThrow("invalid job row");
    }
  });

  test("rejects blank identity and fencing fields", () => {
    for (const field of ["id", "automation_id", "worker_token", "idempotency_key"]) {
      const row = validRow();
      row[field] = "   ";
      expect(() => parseClaimedExecutionJob(row)).toThrow("missing required fields");
    }
  });

  test("rejects invalid attempt counters before execution", () => {
    for (const [attempts, max_attempts] of [[0, 3], [4, 3], [1, 0], [1, 11], [1.5, 3]]) {
      const row = validRow();
      row.attempts = attempts;
      row.max_attempts = max_attempts;
      expect(() => parseClaimedExecutionJob(row)).toThrow("invalid attempt counters");
    }
  });

  test("rejects oversized job, automation, and lease identifiers", () => {
    for (const field of ["id", "automation_id", "worker_token"]) {
      const row = validRow();
      row[field] = "x".repeat(201);
      expect(() => parseClaimedExecutionJob(row)).toThrow("missing required fields");
    }
  });

  test("rejects oversized idempotency keys", () => {
    const row = validRow();
    row.idempotency_key = "x".repeat(201);
    expect(() => parseClaimedExecutionJob(row)).toThrow("missing required fields");
  });

  test("rejects invalid or oversized stored payloads", () => {
    const primitivePayload = validRow();
    primitivePayload.payload = ["not", "an", "object"];
    expect(() => parseClaimedExecutionJob(primitivePayload)).toThrow("invalid payload");

    const oversizedPayload = validRow();
    oversizedPayload.payload = { body: "x".repeat(17 * 1024) };
    expect(() => parseClaimedExecutionJob(oversizedPayload)).toThrow("invalid payload");
  });
});
