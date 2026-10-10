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

  it("allows the manually invoked trigger during live preflight", () => {
    expect(liveCapabilityError(node("trigger.manual"))).toBeNull();
  });

  it("records the manual trigger as accepted when a live flow is invoked", async () => {
    const result = await executeStep({
      node: node("trigger.manual"),
      flowName: "Manual flow",
      userId: "user_1",
      mode: "live",
    });
    expect(result.status).toBe("success");
    expect(result.detail).toMatch(/Manual trigger accepted/i);
  });

  it("rejects a private HTTP destination during live preflight", async () => {
    const result = await livePreflightError(node("action.http", { url: "http://127.0.0.1/admin" }), "user_1");
    expect(result).toMatch(/private or local/i);
  });

  it("requires a destination URL for an HTTP action", () => {
    expect(liveCapabilityError(node("action.http"))).toMatch(/destination URL/i);
  });
  it("fails closed on unresolved dynamic mapping tokens before external effects", () => {
    expect(liveCapabilityError(node("action.gmail", {
      to: "{{trigger.email}}",
      subject: "Welcome {{trigger.name}}",
      body: "Your order is {{trigger.order_id}}",
    }))).toMatch(/dynamic data mapping is not allowed for "to"/i);
    expect(liveCapabilityError(node("action.http", {
      url: "https://example.com",
      body: JSON.stringify({ customer: "{{steps.previous.output}}" }),
    }))).toBeNull();
    expect(liveCapabilityError(node("action.http", {
      url: "{{steps.previous.url}}",
      body: "{}",
    }))).toMatch(/not allowed for "url"/i);
  });


  it("returns only allowlisted scalar output fields for a successful HTTP response", async () => {
    // HTTP is deployment-gated, so test the executor output contract at the shared runner boundary.
    const { executeFlowSteps } = await import("../execute-flow-steps.server");
    const result = await executeFlowSteps({
      nodes: [{ ...node("trigger.manual"), id: "trigger" }, { ...node("action.http"), id: "http" }],
      flowName: "outputs", userId: "user_1", mode: "live", startedAtMs: Date.now(), maxRuntimeMs: 10000,
      persistIntent: async (_node, i) => ({ id: String(i) }), persistOutcome: async () => true,
      execute: async ({ node: current }) => ({ nodeId: current.id, label: current.name, status: "success", ms: 1, detail: "ok", ...(current.id === "http" ? { outputs: { httpStatus: 201 } } : {}) }),
    });
    expect(result.steps[1].outputs).toEqual({ httpStatus: 201 });
  });

  it("refuses unresolved mapping tokens if the executor is called without the flow engine", async () => {
    const result = await executeStep({
      node: node("action.http", { url: "https://example.com", body: "{{steps.previous.body}}" }),
      flowName: "Unresolved mapping",
      userId: "user_1",
      mode: "live",
    });
    expect(result.status).toBe("failed");
    expect(result.detail).toMatch(/unresolved data tokens/i);
  });

  it("fails closed on live HTTP until the deployment runtime is explicitly verified", async () => {
    const result = await executeStep({
      node: node("action.http", { url: "https://example.com", method: "GET" }),
      flowName: "Runtime gate",
      userId: "user_1",
      mode: "live",
    });
    expect(result.status).toBe("failed");
    expect(result.detail).toMatch(/runtime smoke test/i);
  });
});
