// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, test } from "bun:test";
import { executeFlowSteps } from "../execute-flow-steps.server";

const nodes = [
  { id: "trigger-1", defId: "trigger.manual", name: "Manual trigger", x: 0, y: 0, config: {} },
  { id: "step-1", defId: "action.test", name: "First action", x: 1, y: 0, config: {} },
];

describe("executeFlowSteps execution-budget boundary", () => {
  test("fails closed and persists a no-effect outcome for invalid runtime budgets", async () => {
    const invalidBudgets = [
      { startedAtMs: Number.NaN, maxRuntimeMs: 10_000 },
      { startedAtMs: Number.POSITIVE_INFINITY, maxRuntimeMs: 10_000 },
      { startedAtMs: Date.now() + 10_000, maxRuntimeMs: 10_000 },
      { startedAtMs: Date.now(), maxRuntimeMs: Number.NaN },
      { startedAtMs: Date.now(), maxRuntimeMs: Number.POSITIVE_INFINITY },
      { startedAtMs: Date.now(), maxRuntimeMs: 0 },
      { startedAtMs: Date.now(), maxRuntimeMs: -1 },
    ];

    for (const budget of invalidBudgets) {
      let executeCalls = 0;
      const intents: number[] = [];
      const outcomes: Array<{ status: string; state: string }> = [];
      const result = await executeFlowSteps({
        nodes,
        flowName: "budget test",
        userId: "user-1",
        mode: "live",
        startedAtMs: budget.startedAtMs,
        maxRuntimeMs: budget.maxRuntimeMs,
        persistIntent: async (_node, index) => {
          intents.push(index);
          return { id: `intent-${index}` };
        },
        persistOutcome: async (_id, step, state) => {
          outcomes.push({ status: step.status, state });
          return true;
        },
        execute: async ({ node }) => {
          executeCalls += 1;
          return { nodeId: node.id, label: node.name, status: "success", ms: 1, detail: "unexpected" };
        },
      });

      expect(result.failed).toBe(true);
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].detail).toContain("execution budget is invalid");
      expect(executeCalls).toBe(0);
      expect(intents).toEqual([0]);
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].status).toBe("failed");
      expect(outcomes[0].state).toBe("not_attempted");
    }
  });

  test("still executes when the runtime budget is finite, positive, and current", async () => {
    let executeCalls = 0;
    const result = await executeFlowSteps({
      nodes,
      flowName: "budget test",
      userId: "user-1",
      mode: "live",
      startedAtMs: Date.now(),
      maxRuntimeMs: 10_000,
      persistIntent: async (_node, index) => ({ id: `intent-${index}` }),
      persistOutcome: async () => true,
      execute: async ({ node }) => {
        executeCalls += 1;
        return { nodeId: node.id, label: node.name, status: "success", ms: 1, detail: "ok" };
      },
    });

    expect(result.failed).toBe(false);
    expect(executeCalls).toBe(2);
  });
});
