// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { planLinearExecution } from "../execution-plan";

const node = (id: string, defId = "action.http") => ({
  id, defId, x: 0, y: 0, name: id, config: {},
});
const flow = (nodes: ReturnType<typeof node>[], pairs: Array<[string, string]>) => ({
  nodes,
  edges: pairs.map(([from, to], i) => ({ id: `e${i}`, from, to })),
});

describe("linear live execution planner", () => {
  it("orders a valid chain from its trigger rather than canvas order", () => {
    const result = planLinearExecution(flow(
      [node("last"), node("trigger", "trigger.webhook"), node("middle")],
      [["trigger", "middle"], ["middle", "last"]],
    ));
    expect(result.error).toBeNull();
    expect(result.nodes.map((entry) => entry.id)).toEqual(["trigger", "middle", "last"]);
  });

  it("rejects disconnected steps instead of silently skipping them", () => {
    const result = planLinearExecution(flow(
      [node("trigger", "trigger.webhook"), node("action"), node("orphan")],
      [["trigger", "action"]],
    ));
    expect(result.error).toMatch(/connected chain|disconnected/i);
  });

  it("rejects branching until branch semantics are implemented", () => {
    const result = planLinearExecution(flow(
      [node("trigger", "trigger.webhook"), node("left"), node("right")],
      [["trigger", "left"], ["trigger", "right"]],
    ));
    expect(result.error).toMatch(/branching|chain/i);
  });

  it("rejects cycles and malformed connections", () => {
    const cycle = planLinearExecution(flow(
      [node("trigger", "trigger.webhook"), node("action")],
      [["trigger", "action"], ["action", "trigger"]],
    ));
    expect(cycle.error).toBeTruthy();

    const dangling = planLinearExecution(flow(
      [node("trigger", "trigger.webhook")],
      [["trigger", "missing"]],
    ));
    expect(dangling.error).toMatch(/invalid connection/i);
  });

  it("rejects invalid mapping references during planning before any API entry point can enqueue execution", () => {
    const invalid = flow(
      [
        node("trigger", "trigger.manual"),
        { ...node("email", "action.gmail"), config: { subject: "{{steps.trigger.accepted}}" } },
      ],
      [["trigger", "email"]],
    );
    expect(planLinearExecution(invalid).error).toMatch(/not a declared output|not an earlier step/i);
  });

  it("accepts declared mapping references from an earlier HTTP step", () => {
    const valid = flow(
      [
        node("trigger", "trigger.manual"),
        { ...node("request", "action.http"), config: { url: "https://example.com" } },
        { ...node("email", "action.gmail"), config: { subject: "HTTP {{steps.request.httpStatus}}" } },
      ],
      [["trigger", "request"], ["request", "email"]],
    );
    const result = planLinearExecution(valid);
    expect(result.error).toBeNull();
    expect(result.nodes.map((entry) => entry.id)).toEqual(["trigger", "request", "email"]);
  });

  it("rejects malformed persisted nodes without throwing", () => {
    const malformed = {
      nodes: [
        { ...node("trigger", "trigger.webhook"), defId: null },
      ],
      edges: [],
    };
    expect(planLinearExecution(malformed).error).toMatch(/malformed/i);
  });

  it("rejects non-string persisted configuration values without throwing", () => {
    const malformed = flow([node("trigger", "trigger.webhook"), node("action")], [["trigger", "action"]]);
    malformed.nodes[1].config = { body: { nested: "unexpected object" } };
    expect(planLinearExecution(malformed).error).toMatch(/invalid configuration values/i);
  });

  it("rejects duplicate connection IDs even when endpoints differ", () => {
    const malformed = {
      nodes: [node("trigger", "trigger.webhook"), node("middle"), node("last")],
      edges: [
        { id: "same", from: "trigger", to: "middle" },
        { id: "same", from: "middle", to: "last" },
      ],
    };
    expect(planLinearExecution(malformed).error).toMatch(/duplicate connection IDs/i);
  });

  it("requires exactly one trigger", () => {
    const result = planLinearExecution(flow(
      [node("trigger-a", "trigger.webhook"), node("trigger-b", "trigger.schedule")],
      [["trigger-a", "trigger-b"]],
    ));
    expect(result.error).toMatch(/exactly one trigger/i);
  });
});
