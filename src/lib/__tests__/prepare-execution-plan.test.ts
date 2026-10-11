// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { preparePersistedExecutionPlan } from "../prepare-execution-plan";

const valid = {
  name: "Example",
  nodes: [
    { id: "trigger", defId: "trigger.manual", x: 0, y: 0, name: "Start", config: {} },
    { id: "request", defId: "action.http", x: 100, y: 0, name: "Request", config: { url: "https://example.com" } },
  ],
  edges: [{ id: "edge-1", from: "trigger", to: "request" }],
};

describe("shared persisted execution preflight", () => {
  it("returns the parsed workflow and validated linear plan", () => {
    const result = preparePersistedExecutionPlan(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.workflow.nodes).toHaveLength(2);
      expect(result.plan.nodes.map((node) => node.id)).toEqual(["trigger", "request"]);
    }
  });

  it("rejects malformed persisted JSON before producing a plan", () => {
    const result = preparePersistedExecutionPlan({ name: "Broken", nodes: [{ id: "incomplete" }], edges: [] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/saved automation is invalid/i);
  });

  it("rejects invalid graph structure before producing a plan", () => {
    const result = preparePersistedExecutionPlan({
      ...valid,
      edges: [{ id: "edge-1", from: "trigger", to: "missing" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/invalid connection/i);
  });

  it("rejects a later invalid mapping before execution planning can be accepted", () => {
    const result = preparePersistedExecutionPlan({
      ...valid,
      nodes: [
        valid.nodes[0],
        valid.nodes[1],
        { id: "email", defId: "action.gmail", x: 200, y: 0, name: "Email", config: { subject: "{{steps.trigger.accepted}}" } },
      ],
      edges: [
        { id: "edge-1", from: "trigger", to: "request" },
        { id: "edge-2", from: "request", to: "email" },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/not an earlier step|not a declared output/i);
  });

  it("rejects unsafe graph shapes at the shared execution trust boundary", () => {
    const cases = [
      {
        label: "duplicate step IDs",
        value: { ...valid, nodes: [valid.nodes[0], { ...valid.nodes[1], id: "trigger" }] },
      },
      {
        label: "branching paths",
        value: {
          ...valid,
          nodes: [...valid.nodes, { id: "third", defId: "action.http", x: 200, y: 0, name: "Third", config: {} }],
          edges: [
            { id: "edge-1", from: "trigger", to: "request" },
            { id: "edge-2", from: "trigger", to: "third" },
          ],
        },
      },
      {
        label: "cycles",
        value: {
          ...valid,
          edges: [
            { id: "edge-1", from: "trigger", to: "request" },
            { id: "edge-2", from: "request", to: "trigger" },
          ],
        },
      },
      {
        label: "multiple triggers",
        value: {
          ...valid,
          nodes: [
            valid.nodes[0],
            { id: "second-trigger", defId: "trigger.webhook", x: 100, y: 100, name: "Second trigger", config: {} },
          ],
          edges: [{ id: "edge-1", from: "trigger", to: "second-trigger" }],
        },
      },
    ];

    for (const entry of cases) {
      const result = preparePersistedExecutionPlan(entry.value);
      expect(result.success, entry.label).toBe(false);
      if (!result.success) expect(result.error.length, entry.label).toBeGreaterThan(0);
    }
  });

  it("rejects malformed edge records and invalid configuration types without throwing", () => {
    const malformedEdge = preparePersistedExecutionPlan({
      ...valid,
      edges: [{ id: "", from: "trigger", to: "request" }],
    });
    expect(malformedEdge.success).toBe(false);

    const malformedConfig = preparePersistedExecutionPlan({
      ...valid,
      nodes: [
        valid.nodes[0],
        { ...valid.nodes[1], config: { body: { nested: "not a supported config value" } } },
      ],
    });
    expect(malformedConfig.success).toBe(false);
  });

});
