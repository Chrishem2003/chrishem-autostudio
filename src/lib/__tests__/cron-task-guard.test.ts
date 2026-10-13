// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { runCronTaskAfterAuthentication } from "../cron-task-guard";
import { processOneExecutionJob } from "../execution-job-worker";

function request() {
  return new Request("https://autostudio.test/api/public/cron/run-execution-job", { method: "POST" });
}

describe("authenticated cron task guard", () => {
  it("returns authentication failures without constructing or running the worker task", async () => {
    let taskCalls = 0;
    let dependencyConstructionCalls = 0;
    const denied = new Response("Unauthorized", { status: 401 });

    const result = await runCronTaskAfterAuthentication(
      request(),
      async () => denied,
      async () => {
        taskCalls++;
        dependencyConstructionCalls++;
        return "should not run";
      },
    );

    expect(result.denied).toBeInstanceOf(Response);
    expect(taskCalls).toBe(0);
    expect(dependencyConstructionCalls).toBe(0);
  });

  it("runs the worker exactly once after successful authentication", async () => {
    let authCalls = 0;
    let taskCalls = 0;
    const result = await runCronTaskAfterAuthentication(
      request(),
      async () => { authCalls++; return null; },
      async () => {
        taskCalls++;
        return processOneExecutionJob({
          claim: async () => null,
          heartbeat: async () => true,
          execute: async () => ({ status: "succeeded", sideEffectCertainty: "effect_confirmed" }),
          finish: async () => true,
        });
      },
    );

    expect(result.denied).toBeUndefined();
    expect(result.result).toEqual({ outcome: "empty" });
    expect(authCalls).toBe(1);
    expect(taskCalls).toBe(1);
  });

  it("propagates worker errors without disguising them as an empty queue", async () => {
    const result = runCronTaskAfterAuthentication(
      request(),
      async () => null,
      async () => { throw new Error("queue transport unavailable"); },
    );

    await expect(result).rejects.toThrow("queue transport unavailable");
  });
});
