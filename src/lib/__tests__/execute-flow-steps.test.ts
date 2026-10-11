// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { executeFlowSteps } from "../execute-flow-steps.server";
import { executeStep } from "../execute-step.server";

const nodes = [
  { id: "trigger-1", defId: "trigger.manual", name: "Manual trigger", x: 0, y: 0, config: {} },
  { id: "step-1", defId: "action.test", name: "First action", x: 1, y: 0, config: {} },
  { id: "step-2", defId: "action.test", name: "Second action", x: 2, y: 0, config: {} },
];

const baseInput = (overrides = {}) => ({
  nodes,
  flowName: "test flow",
  userId: "user-1",
  mode: "live",
  startedAtMs: Date.now(),
  maxRuntimeMs: 240_000,
  persistIntent: async (_node, index) => ({ id: `intent-${index}` }),
  persistOutcome: async () => true,
  ...overrides,
});

describe("shared flow-step engine", () => {
  it("executes in order and persists each step outcome", async () => {
    const calls = [];
    const result = await executeFlowSteps(baseInput({
      persistIntent: async (_node, index) => { calls.push(`intent-${index}`); return { id: `i-${index}` }; },
      persistOutcome: async (id, step, outcome) => { calls.push(`outcome-${id}-${step.status}-${outcome}`); return true; },
      execute: async ({ node }) => ({ nodeId: node.id, label: node.name, status: "success", ms: 1, detail: "ok" }),
    }));
    expect(calls[0]).toBe("intent-0");
    expect(calls.some((call) => call.startsWith("outcome-i-0-"))).toBe(true);
    expect(result.steps).toHaveLength(3);
    expect(result.failed).toBe(false);
  });

  it("resolves a declared prior-step output after whole-flow preflight", async () => {
    const receivedConfigs = [];
    const source = { ...nodes[1], defId: "action.http", config: {} };
    const target = { ...nodes[2], defId: "action.gmail", config: { subject: "Result: {{steps.step-1.httpStatus}}" } };
    const result = await executeFlowSteps(baseInput({
      execute: async ({ node }) => {
        receivedConfigs.push({ id: node.id, config: node.config });
        return node.id === "step-1"
          ? { nodeId: node.id, label: node.name, status: "success", ms: 1, detail: "ok", outputs: { httpStatus: 201 } }
          : { nodeId: node.id, label: node.name, status: "success", ms: 1, detail: "ok" };
      },
      nodes: [nodes[0], source, target],
    }));
    expect(result.failed).toBe(false);
    expect(receivedConfigs[2].config.subject).toBe("Result: 201");
  });

  it("strips undeclared provider fields before persisting or mapping outputs", async () => {
    const persisted = [];
    const receivedConfigs = [];
    const source = { ...nodes[1], defId: "action.http", config: {} };
    const target = { ...nodes[2], defId: "action.gmail", config: { subject: "Status {{steps.step-1.httpStatus}}" } };
    const result = await executeFlowSteps(baseInput({
      nodes: [nodes[0], source, target],
      execute: async ({ node }) => {
        receivedConfigs.push({ id: node.id, config: node.config });
        return node.id === "step-1"
          ? { nodeId: node.id, label: node.name, status: "success", ms: 1, detail: "ok", outputs: { httpStatus: 201, responseBody: "private payload", access_token: "secret-token" } }
          : { nodeId: node.id, label: node.name, status: "success", ms: 1, detail: "ok" };
      },
      persistOutcome: async (_id, step) => { persisted.push(step); return true; },
    }));
    expect(result.failed).toBe(false);
    expect(persisted[1].outputs).toEqual({ httpStatus: 201 });
    expect(JSON.stringify(persisted)).not.toContain("private payload");
    expect(JSON.stringify(persisted)).not.toContain("secret-token");
    expect(receivedConfigs[2].config.subject).toBe("Status 201");
  });

  it("blocks the entire flow before any executor when a later mapping is invalid", async () => {
    let executions = 0;
    const persisted = [];
    const result = await executeFlowSteps(baseInput({
      nodes: [nodes[0], { ...nodes[1], defId: "action.http", config: {} }, { ...nodes[2], defId: "action.gmail", config: { subject: "{{steps.trigger-1.httpStatus}}" } }],
      execute: async ({ node }) => { executions++; return { nodeId: node.id, label: node.name, status: "success", ms: 1, detail: "unexpected" }; },
      persistOutcome: async (_id, step, outcomeState) => { persisted.push({ step, outcomeState }); return true; },
    }));
    expect(result.failed).toBe(true);
    expect(executions).toBe(0);
    expect(persisted).toHaveLength(1);
    expect(result.steps[0].detail).toMatch(/preflight failed before any step executed/i);
    expect(result.steps[0].detail).toMatch(/not an earlier step|not a declared output/i);
  });

  it("halts without executing when intent persistence fails", async () => {
    let executions = 0;
    const result = await executeFlowSteps(baseInput({
      persistIntent: async () => null,
      onPersistenceError: () => { executions += 100; },
      onUnexpectedError: () => { executions++; },
    }));
    expect(result.failed).toBe(true);
    expect(result.steps).toHaveLength(1);
    expect(executions).toBe(100);
    expect(result.steps[0].detail).toMatch(/No action was attempted/i);
  });

  it("stops after the first failed step and never starts later actions", async () => {
    const intentIndexes = [];
    const executedNodes = [];
    const outcomes = [];
    const result = await executeFlowSteps(baseInput({
      persistIntent: async (_node, index) => { intentIndexes.push(index); return { id: `i-${index}` }; },
      persistOutcome: async (id, step, outcome) => { outcomes.push({ id, status: step.status, outcome }); return true; },
      execute: async ({ node }) => {
        executedNodes.push(node.id);
        return { nodeId: node.id, label: node.name, status: node.id === "step-1" ? "failed" : "success", ms: 2, detail: node.id === "step-1" ? "provider refused request" : "ok" };
      },
    }));
    expect(result.failed).toBe(true);
    expect(intentIndexes).toEqual([0, 1]);
    expect(executedNodes).toEqual(["trigger-1", "step-1"]);
    expect(outcomes).toHaveLength(2);
    expect(result.steps).toHaveLength(2);
  });

  it("records an over-budget step as not attempted and halts", async () => {
    const executedNodes = [];
    const outcomes = [];
    const result = await executeFlowSteps(baseInput({
      startedAtMs: 0,
      maxRuntimeMs: 0,
      execute: async ({ node }) => {
        executedNodes.push(node.id);
        return { nodeId: node.id, label: node.name, status: "success", ms: 1, detail: "ok" };
      },
      persistOutcome: async (_id, step, outcomeState) => { outcomes.push({ status: step.status, detail: step.detail, outcomeState }); return true; },
    }));
    expect(result.failed).toBe(true);
    expect(executedNodes).toEqual([]);
    expect(result.steps).toHaveLength(1);
    expect(outcomes[0].outcomeState).toBe("not_attempted");
    expect(outcomes[0].detail).toMatch(/No action was attempted/i);
  });

  it("treats a thrown outcome-persistence callback as a hard stop", async () => {
    let intentCount = 0;
    let executeCount = 0;
    const result = await executeFlowSteps(baseInput({
      persistIntent: async (_node, index) => { intentCount++; return { id: `i-${index}` }; },
      persistOutcome: async () => { throw new Error("database unavailable"); },
      execute: async ({ node }) => { executeCount++; return { nodeId: node.id, label: node.name, status: "success", ms: 1, detail: "ok" }; },
    }));
    expect(result.failed).toBe(true);
    expect(intentCount).toBe(1);
    expect(executeCount).toBe(1);
    expect(result.steps[0].detail).toMatch(/Verify external effects/i);
  });

  it("halts when the final outcome cannot be persisted", async () => {
    let intents = 0;
    const result = await executeFlowSteps(baseInput({
      persistIntent: async (_node, index) => { intents++; return { id: `i-${index}` }; },
      persistOutcome: async () => false,
      execute: async ({ node }) => ({ nodeId: node.id, label: node.name, status: "success", ms: 1, detail: "ok" }),
    }));
    expect(result.failed).toBe(true);
    expect(result.steps).toHaveLength(1);
    expect(intents).toBe(1);
    expect(result.steps[0].detail).toMatch(/verify external effects/i);
  });
  it("stops the linear flow cleanly when a filter output is false", async () => {
    const executed = [];
    const filter = { id: "filter-1", defId: "logic.filter", name: "Only urgent", x: 2, y: 0, config: { condition: 'message contains "urgent"' } };
    const result = await executeFlowSteps(baseInput({
      nodes: [nodes[0], filter, nodes[2]],
      execute: async ({ node }) => {
        executed.push(node.id);
        return { nodeId: node.id, label: node.name, status: "success", ms: 0, detail: "ok", ...(node.defId === "logic.filter" ? { outputs: { passed: false } } : {}) };
      },
    }));
    expect(result.failed).toBe(false);
    expect(executed).toEqual(["trigger-1", "filter-1"]);
  });

  it("evaluates a filter against declared outputs from an earlier step", async () => {
    const executed = [];
    const source = { ...nodes[1], defId: "action.http", config: {} };
    const filter = { id: "filter-1", defId: "logic.filter", name: "Only server errors", x: 2, y: 0, config: { condition: "httpStatus >= 500" } };
    const target = nodes[2];
    const result = await executeFlowSteps(baseInput({
      nodes: [nodes[0], source, filter, target],
      execute: async (args) => {
        executed.push(args.node.id);
        if (args.node.id === "step-1") {
          return { nodeId: args.node.id, label: args.node.name, status: "success", ms: 1, detail: "ok", outputs: { httpStatus: 201 } };
        }
        if (args.node.defId === "logic.filter") return executeStep(args);
        return { nodeId: args.node.id, label: args.node.name, status: "success", ms: 1, detail: "should not run" };
      },
    }));
    expect(result.failed).toBe(false);
    expect(executed).toEqual(["trigger-1", "step-1", "filter-1"]);
    expect(result.steps[2].outputs).toEqual({ passed: false });
  });

  it("passes mapped fields directly to later steps", async () => {
    const receivedConfigs = [];
    const mapper = { id: "mapper", defId: "logic.map", name: "Map lead", x: 1, y: 0, config: { mapping: "full_name = Ada\\nstatus = ready" } };
    const target = { ...nodes[2], defId: "action.gmail", config: { body: "Hello {{steps.mapper.full_name}} ({{steps.mapper.status}})" } };
    const result = await executeFlowSteps(baseInput({
      nodes: [nodes[0], mapper, target],
      execute: async (args) => {
        receivedConfigs.push({ id: args.node.id, config: args.node.config });
        return args.node.defId === "logic.map" ? executeStep(args) : { nodeId: args.node.id, label: args.node.name, status: "success", ms: 1, detail: "ok" };
      },
    }));
    expect(result.failed).toBe(false);
    expect(receivedConfigs[2].config.body).toBe("Hello Ada (ready)");
    expect(result.steps[1].outputs.full_name).toBe("Ada");
  });

  it("allows only the declared passed output from a filter step", async () => {
    const filter = { id: "filter-1", defId: "logic.filter", name: "Filter", x: 2, y: 0, config: { condition: "score >= 70" } };
    const target = { ...nodes[2], defId: "action.http", config: { body: "{{steps.filter-1.passed}}" } };
    const result = await executeFlowSteps(baseInput({
      nodes: [nodes[0], filter, target],
      execute: async ({ node }) => ({ nodeId: node.id, label: node.name, status: "success", ms: 0, detail: "ok", ...(node.defId === "logic.filter" ? { outputs: { passed: true } } : {}) }),
    }));
    expect(result.failed).toBe(false);
  });

});
