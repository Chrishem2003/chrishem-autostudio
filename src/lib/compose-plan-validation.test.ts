import { describe, expect, test } from "bun:test";
import { validateComposePlan } from "./compose-plan-validation";

const candidates = [
  { id: "trigger-1", kind: "trigger" },
  { id: "logic-1", kind: "logic" },
  { id: "action-1", kind: "action" },
  { id: "trigger-2", kind: "trigger" },
];

describe("validateComposePlan", () => {
  test("accepts a catalog-only plan with one leading trigger", () => {
    expect(validateComposePlan(
      { defIds: ["trigger-1", "logic-1", "action-1"], rationale: "safe draft" }, candidates,
    )).toEqual({ ok: true, defIds: ["trigger-1", "logic-1", "action-1"], rationale: "safe draft" });
  });

  test("rejects plans shorter than three or longer than eight steps", () => {
    expect(validateComposePlan({ defIds: ["trigger-1", "action-1"] }, candidates).ok).toBe(false);
    expect(validateComposePlan({ defIds: Array.from({ length: 9 }, (_, i) => "step-" + i) }, candidates).ok).toBe(false);
  });

  test("rejects unknown and duplicate catalog identifiers", () => {
    expect(validateComposePlan({ defIds: ["trigger-1", "missing", "action-1"] }, candidates).ok).toBe(false);
    expect(validateComposePlan({ defIds: ["trigger-1", "logic-1", "logic-1"] }, candidates).ok).toBe(false);
  });

  test("rejects plans that do not start with a trigger", () => {
    expect(validateComposePlan({ defIds: ["logic-1", "trigger-1", "action-1"] }, candidates).ok).toBe(false);
  });

  test("rejects a second trigger anywhere in the plan", () => {
    expect(validateComposePlan({ defIds: ["trigger-1", "trigger-2", "action-1"] }, candidates).ok).toBe(false);
  });

  test("bounds model-authored rationale", () => {
    const result = validateComposePlan({ defIds: ["trigger-1", "logic-1", "action-1"], rationale: "x".repeat(900) }, candidates);
    expect(result.ok).toBe(true);
    expect(result.rationale).toHaveLength(500);
  });
});
