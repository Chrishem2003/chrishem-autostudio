// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { runCronTaskAfterAuthentication, withCronSecurityHeaders } from "../cron-task-guard";
import { processOneExecutionJob } from "../execution-job-worker";

function request() {
  return new Request("https://autostudio.test/api/public/cron/run-execution-job", { method: "POST" });
}

describe("authenticated cron task guard", () => {
  it("applies no-store security headers to authorized cron responses without changing status or body", async () => {
    const response = withCronSecurityHeaders(new Response("queue empty", {
      status: 503,
      headers: { "Content-Type": "text/plain", "Cache-Control": "public, max-age=600" },
    }));
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Pragma")).toBe("no-cache");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Type")).toBe("text/plain");
    expect(await response.text()).toBe("queue empty");
  });

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
    expect(result.denied?.headers.get("Cache-Control")).toBe("no-store");
    expect(result.denied?.headers.get("Pragma")).toBe("no-cache");
    expect(result.denied?.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(taskCalls).toBe(0);
    expect(dependencyConstructionCalls).toBe(0);
  });

  it("fails closed when authentication throws and never runs the protected task", async () => {
    let taskCalls = 0;
    const result = await runCronTaskAfterAuthentication(
      request(),
      async () => { throw new Error("sensitive auth transport detail"); },
      async () => {
        taskCalls++;
        return "must not run";
      },
    );

    expect(result.denied).toBeInstanceOf(Response);
    expect(result.denied?.status).toBe(503);
    expect(result.denied?.headers.get("Cache-Control")).toBe("no-store");
    expect(result.denied?.headers.get("Pragma")).toBe("no-cache");
    expect(result.denied?.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await result.denied?.text()).toBe(JSON.stringify({
      error: "Cron task is temporarily unavailable.",
    }));
    expect(taskCalls).toBe(0);
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
