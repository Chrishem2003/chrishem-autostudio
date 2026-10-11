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
  it("rejects branching graphs instead of flattening them into a false execution order", () => {
    const result = preparePersistedExecutionPlan({
      ...valid,
      nodes: [
        valid.nodes[0],
        valid.nodes[1],
        { id: "second-request", defId: "action.http", x: 200, y: 80, name: "Second request", config: { url: "https://example.org" } },
      ],
      edges: [
        { id: "edge-1", from: "trigger", to: "request" },
        { id: "edge-2", from: "trigger", to: "second-request" },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/branching is not supported/i);
  });

  it("rejects duplicate step IDs before any execution plan is accepted", () => {
    const result = preparePersistedExecutionPlan({
      ...valid,
      nodes: [
        valid.nodes[0],
        { ...valid.nodes[1], id: "trigger" },
      ],
      edges: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/duplicate step ID/i);
  });

  it("rejects a disconnected cycle rather than accepting only the trigger's reachable chain", () => {
    const result = preparePersistedExecutionPlan({
      ...valid,
      nodes: [
        valid.nodes[0],
        valid.nodes[1],
        { id: "cycle-a", defId: "action.http", x: 200, y: 80, name: "Cycle A", config: { url: "https://example.org/a" } },
        { id: "cycle-b", defId: "action.http", x: 300, y: 80, name: "Cycle B", config: { url: "https://example.org/b" } },
      ],
      edges: [
        { id: "edge-1", from: "trigger", to: "request" },
        { id: "edge-2", from: "cycle-a", to: "cycle-b" },
        { id: "edge-3", from: "cycle-b", to: "cycle-a" },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/disconnected|cycle/i);
  });

});
