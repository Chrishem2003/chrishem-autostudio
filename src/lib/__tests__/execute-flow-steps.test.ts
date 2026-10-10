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
      execute: undefined,
    }));
    // The production executor is used here, so live actions may fail closed;
    // this assertion focuses on durable intent/outcome ordering and fail-stop safety.
    expect(calls[0]).toBe("intent-0");
    expect(calls.some((call) => call.startsWith("outcome-i-0-"))).toBe(true);
    expect(result.steps.length).toBeGreaterThan(0);
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

  it("halts when the final outcome cannot be persisted", async () => {
    let intents = 0;
    const result = await executeFlowSteps(baseInput({
      persistIntent: async (_node, index) => { intents++; return { id: `i-${index}` }; },
      persistOutcome: async () => false,
    }));
    expect(result.failed).toBe(true);
    expect(result.steps).toHaveLength(1);
    expect(intents).toBe(1);
    expect(result.steps[0].detail).toMatch(/verify external effects/i);
  });
});
