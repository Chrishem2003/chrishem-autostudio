// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { executeStepSafely } from "../execute-step-safely.server";

const node = { id: "step-1", name: "Send notification" };

describe("shared safe step execution boundary", () => {
  it("converts unexpected provider exceptions into an uncertain-friendly failed result", async () => {
    let observedError = false;
    const result = await executeStepSafely({
      node,
      flowName: "test flow",
      userId: "user-1",
      mode: "live",
      execute: async () => { throw new Error("private provider details"); },
      onUnexpectedError: (error) => { observedError = error instanceof Error; },
    });

    expect(observedError).toBe(true);
    expect(result).toMatchObject({
      nodeId: "step-1",
      label: "Send notification",
      status: "failed",
      ms: 0,
    });
    expect(result.detail).toMatch(/outcome may be uncertain/i);
    expect(result.detail).not.toContain("private provider details");
  });

  it("preserves successful executor results", async () => {
    const expected = {
      nodeId: "step-1",
      label: "Send notification",
      status: "success",
      ms: 12,
      detail: "Provider accepted the request.",
    };
    const result = await executeStepSafely({
      node,
      flowName: "test flow",
      userId: "user-1",
      mode: "live",
      execute: async () => expected,
    });
    expect(result).toEqual(expected);
  });
});
