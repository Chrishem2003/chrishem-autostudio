// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, test } from "bun:test";
import { runWithExecutionLeaseKeepalive } from "../execution-lease-keepalive.server";

describe("runWithExecutionLeaseKeepalive", () => {
  test("renews the lease while an action remains pending", async () => {
    let heartbeats = 0;
    const result = await runWithExecutionLeaseKeepalive(
      () => new Promise((resolve) => setTimeout(() => resolve("done"), 35)),
      async () => { heartbeats += 1; return true; },
      5,
    );
    expect(result).toBe("done");
    expect(heartbeats).toBeGreaterThan(0);
  });

  test("fails closed when a heartbeat reports lost ownership", async () => {
    let settled = false;
    await expect(runWithExecutionLeaseKeepalive(
      () => new Promise((resolve) => setTimeout(() => { settled = true; resolve("provider result"); }, 25)),
      async () => false,
      5,
    )).rejects.toThrow("outcome requires review");
    expect(settled).toBe(true);
  });

  test("does not accept truthy malformed heartbeat responses", async () => {
    await expect(runWithExecutionLeaseKeepalive(
      () => new Promise((resolve) => setTimeout(() => resolve("done"), 25)),
      async () => ({ alive: true }),
      5,
    )).rejects.toThrow("outcome requires review");
  });

  test("propagates an action error when lease ownership remains valid", async () => {
    await expect(runWithExecutionLeaseKeepalive(
      async () => { throw new Error("provider failed"); },
      async () => true,
      5,
    )).rejects.toThrow("provider failed");
  });

  test("rejects invalid heartbeat intervals before starting the action", async () => {
    let called = false;
    await expect(runWithExecutionLeaseKeepalive(
      async () => { called = true; return "done"; },
      async () => true,
      0,
    )).rejects.toThrow("Invalid execution lease heartbeat interval");
    expect(called).toBe(false);
  });

  test("requires review when heartbeat rejects during a provider action", async () => {
    let actionSettled = false;
    await expect(runWithExecutionLeaseKeepalive(
      () => new Promise((_resolve, reject) => setTimeout(() => {
        actionSettled = true;
        reject(new Error("provider request timed out"));
      }, 30)),
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 2));
        throw new Error("heartbeat transport failed");
      },
      5,
    )).rejects.toThrow("outcome requires review");
    expect(actionSettled).toBe(true);
  });

  test("never runs overlapping lease heartbeat requests", async () => {
    let active = 0;
    let maximumActive = 0;
    let heartbeats = 0;
    const result = await runWithExecutionLeaseKeepalive(
      () => new Promise((resolve) => setTimeout(() => resolve("done"), 45)),
      async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        heartbeats += 1;
        await new Promise((resolve) => setTimeout(resolve, 12));
        active -= 1;
        return true;
      },
      3,
    );
    expect(result).toBe("done");
    expect(heartbeats).toBeGreaterThan(0);
    expect(maximumActive).toBe(1);
  });

});
