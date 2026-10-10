// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { executeFlowSteps } from "../execute-flow-steps.server";

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
});
