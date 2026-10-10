// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, it, expect } from "bun:test";
import { executeStep, liveCapabilityError, livePreflightError } from "../execute-step.server";

const node = (defId: string, config: Record<string, string> = {}) => ({
  id: "node_1",
  defId,
  x: 0,
  y: 0,
  name: defId,
  config,
});

describe("server-side execution guardrails", () => {
  it("dry mode never attempts an external side effect", async () => {
    const result = await executeStep({
      node: node("action.gmail", { to: "someone@example.com" }),
      flowName: "Preview only",
      userId: "user_1",
      mode: "dry",
    });
    expect(result.status).toBe("dry_run");
    expect(result.detail).toContain("no external request");
  });

  it("does not allow an unimplemented catalog action to go live", () => {
    expect(liveCapabilityError(node("app.hubspot.create.contact"))).toMatch(/no verified live executor/i);
  });

  it("allows the implemented schedule trigger", () => {
    expect(liveCapabilityError(node("trigger.schedule", { cadence: "Hourly" }))).toBeNull();
  });

  it("rejects a private HTTP destination during live preflight", async () => {
    const result = await livePreflightError(node("action.http", { url: "http://127.0.0.1/admin" }), "user_1");
    expect(result).toMatch(/public-address safety check/i);
  });

  it("requires a destination URL for an HTTP action", () => {
    expect(liveCapabilityError(node("action.http"))).toMatch(/destination URL/i);
  });
});
