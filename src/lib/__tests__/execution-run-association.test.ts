// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, test } from "bun:test";
import { createAndAttachExecutionJobRun } from "../execution-run-association";

describe("durable job audit-run association boundary", () => {
  test("does not attach or return an executable run when run creation fails", async () => {
    let attachCalls = 0;
    await expect(createAndAttachExecutionJobRun({
      createRun: async () => ({ runId: null, failed: true }),
      attachRun: async () => { attachCalls++; return { attached: true }; },
    })).rejects.toThrow(/no workflow steps were started/i);
    expect(attachCalls).toBe(0);
  });

  test("keeps the created run ID available for recovery when association is rejected", async () => {
    let recoverableRunId: string | null = null;
    await expect(createAndAttachExecutionJobRun({
      createRun: async () => ({ runId: "run-123" }),
      onRunCreated: (runId) => { recoverableRunId = runId; },
      attachRun: async () => ({ attached: false }),
    })).rejects.toThrow(/execution halted/i);
    expect(recoverableRunId).toBe("run-123");
  });

  test("fails closed when association transport throws", async () => {
    await expect(createAndAttachExecutionJobRun({
      createRun: async () => ({ runId: "run-123" }),
      attachRun: async () => { throw new Error("database unavailable"); },
    })).rejects.toThrow(/execution halted/i);
  });

  test("returns the run ID only after association is confirmed", async () => {
    const calls: string[] = [];
    const runId = await createAndAttachExecutionJobRun({
      createRun: async () => { calls.push("create"); return { runId: "run-123" }; },
      attachRun: async (id) => { calls.push("attach:" + id); return { attached: true }; },
    });
    expect(runId).toBe("run-123");
    expect(calls).toEqual(["create", "attach:run-123"]);
  });
});
