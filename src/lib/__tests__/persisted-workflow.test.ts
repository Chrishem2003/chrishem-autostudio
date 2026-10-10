// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { parsePersistedWorkflow } from "../persisted-workflow";

const valid = {
  id: "automation-1",
  name: "Example",
  vertical: "general",
  live: true,
  updatedAt: 123,
  nodes: [
    { id: "trigger", defId: "trigger.manual", x: 0, y: 0, name: "Start", config: {} },
    { id: "request", defId: "action.http", x: 100, y: 0, name: "Request", config: { url: "https://example.com" } },
  ],
  edges: [{ id: "edge-1", from: "trigger", to: "request" }],
};

describe("persisted workflow runtime validation", () => {
  it("accepts a valid workflow and preserves workflow metadata", () => {
    const result = parsePersistedWorkflow(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Example");
      expect(result.data.id).toBe("automation-1");
      expect(result.data.nodes).toHaveLength(2);
    }
  });

  it("rejects null, arrays, and incomplete JSON without throwing", () => {
    expect(parsePersistedWorkflow(null).success).toBe(false);
    expect(parsePersistedWorkflow([]).success).toBe(false);
    expect(parsePersistedWorkflow({ name: "Missing graph" }).success).toBe(false);
  });

  it("rejects malformed node fields and non-finite coordinates", () => {
    expect(parsePersistedWorkflow({
      ...valid,
      nodes: [{ ...valid.nodes[0], defId: null }],
    }).success).toBe(false);
    expect(parsePersistedWorkflow({
      ...valid,
      nodes: [{ ...valid.nodes[0], x: Number.POSITIVE_INFINITY }],
    }).success).toBe(false);
  });

  it("bounds configuration keys and values before planner or execution work", () => {
    expect(parsePersistedWorkflow({
      ...valid,
      nodes: [{ ...valid.nodes[0], config: { body: "x".repeat(8_001) } }],
    }).success).toBe(false);
    expect(parsePersistedWorkflow({
      ...valid,
      nodes: [{ ...valid.nodes[0], config: { ["k".repeat(121)]: "value" } }],
    }).success).toBe(false);
  });

  it("rejects oversized graphs and malformed edges", () => {
    expect(parsePersistedWorkflow({
      ...valid,
      nodes: Array.from({ length: 201 }, (_, index) => ({
        id: String(index), defId: "action.http", x: 0, y: 0, name: "Node", config: {},
      })),
    }).success).toBe(false);
    expect(parsePersistedWorkflow({
      ...valid,
      edges: [{ id: "edge-1", from: "trigger", to: null }],
    }).success).toBe(false);
  });
  it("rejects duplicate node IDs and invalid graph connections at the planner boundary", async () => {
    const { planLinearExecution } = await import("../execution-plan");
    const duplicateNodes = {
      nodes: [
        { ...valid.nodes[0], id: "trigger" },
        { ...valid.nodes[1], id: "trigger" },
      ],
      edges: [],
    };
    const parsedDuplicate = parsePersistedWorkflow(duplicateNodes);
    // Duplicate identifiers are rejected at the earliest runtime boundary.
    expect(parsedDuplicate.success).toBe(false);

    const dangling = {
      ...valid,
      edges: [{ id: "edge-1", from: "trigger", to: "missing-node" }],
    };
    const parsedDangling = parsePersistedWorkflow(dangling);
    expect(parsedDangling.success).toBe(true);
    if (parsedDangling.success) {
      expect(planLinearExecution(parsedDangling.data).error).toMatch(/invalid connection/i);
    }
  });

  it("rejects overlong workflow, node, and edge identifiers before execution", () => {
    expect(parsePersistedWorkflow({
      ...valid,
      name: "n".repeat(201),
    }).success).toBe(false);
    expect(parsePersistedWorkflow({
      ...valid,
      nodes: [{ ...valid.nodes[0], id: "i".repeat(121) }],
      edges: [],
    }).success).toBe(false);
    expect(parsePersistedWorkflow({
      ...valid,
      edges: [{ id: "e".repeat(121), from: "trigger", to: "request" }],
    }).success).toBe(false);
  });

  it("rejects too many edges before graph planning", () => {
    expect(parsePersistedWorkflow({
      ...valid,
      edges: Array.from({ length: 501 }, (_, index) => ({
        id: `edge-${index}`, from: "trigger", to: "request",
      })),
    }).success).toBe(false);
  });

});
