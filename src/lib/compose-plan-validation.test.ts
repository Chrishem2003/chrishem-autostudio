import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateComposePlan } from "./compose-plan-validation";

const candidates = [
  { id: "trigger-1", kind: "trigger" },
  { id: "logic-1", kind: "logic" },
  { id: "action-1", kind: "action" },
  { id: "trigger-2", kind: "trigger" },
];

describe("validateComposePlan", () => {
  it("accepts a catalog-only plan with one leading trigger", () => {
    assert.deepEqual(
      validateComposePlan({ defIds: ["trigger-1", "logic-1", "action-1"], rationale: "safe draft" }, candidates),
      { ok: true, defIds: ["trigger-1", "logic-1", "action-1"], rationale: "safe draft" },
    );
  });

  it("rejects plans shorter than three or longer than eight steps", () => {
    assert.equal(validateComposePlan({ defIds: ["trigger-1", "action-1"] }, candidates).ok, false);
    assert.equal(validateComposePlan({ defIds: Array.from({ length: 9 }, (_, i) => "step-" + i) }, candidates).ok, false);
  });

  it("rejects unknown and duplicate catalog identifiers", () => {
    assert.equal(validateComposePlan({ defIds: ["trigger-1", "missing", "action-1"] }, candidates).ok, false);
    assert.equal(validateComposePlan({ defIds: ["trigger-1", "logic-1", "logic-1"] }, candidates).ok, false);
  });

  it("rejects plans that do not start with a trigger", () => {
    assert.equal(validateComposePlan({ defIds: ["logic-1", "trigger-1", "action-1"] }, candidates).ok, false);
  });

  it("rejects a second trigger anywhere in the plan", () => {
    assert.equal(validateComposePlan({ defIds: ["trigger-1", "trigger-2", "action-1"] }, candidates).ok, false);
  });

  it("bounds model-authored rationale", () => {
    const result = validateComposePlan({ defIds: ["trigger-1", "logic-1", "action-1"], rationale: "x".repeat(900) }, candidates);
    assert.equal(result.ok, true);
    assert.equal(result.rationale.length, 500);
  });
});
