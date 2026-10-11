// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { evaluateFilterCondition } from "../logic-filter";
describe("logic.filter condition evaluation", () => {
  it("compares text exactly and case-insensitively for contains", () => {
    expect(evaluateFilterCondition('status == "ready"', { status: "ready" })).toEqual({ ok: true, passed: true });
    expect(evaluateFilterCondition('message contains "URGENT"', { message: "This is urgent" })).toEqual({ ok: true, passed: true });
    expect(evaluateFilterCondition('message not contains "spam"', { message: "This is urgent" })).toEqual({ ok: true, passed: true });
  });
  it("supports numeric comparisons", () => {
    expect(evaluateFilterCondition("score >= 70", { score: 70 })).toEqual({ ok: true, passed: true });
    expect(evaluateFilterCondition("score < 70", { score: 72 })).toEqual({ ok: true, passed: false });
  });
  it("supports empty checks and rejects unsupported or oversized conditions", () => {
    expect(evaluateFilterCondition('"" is empty')).toEqual({ ok: true, passed: true });
    expect(evaluateFilterCondition("")).toMatchObject({ ok: false });
    expect(evaluateFilterCondition("left && right")).toMatchObject({ ok: false });
    expect(evaluateFilterCondition("x".repeat(2_001))).toMatchObject({ ok: false });
    expect(evaluateFilterCondition("ready > none")).toMatchObject({ ok: false });
  });
});
