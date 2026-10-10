// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, test } from "bun:test";
import { sanitizeStepOutputs } from "../safe-step-outputs";

describe("sanitizeStepOutputs", () => {
  test("drops outputs when no reviewed connector contract exists", () => {
    const node = { id: "n1", defId: "unknown", name: "Unknown", config: {} };
    const step = { nodeId: "n1", label: "Unknown", status: "success", ms: 1, detail: "ok", outputs: { secret: "do-not-persist" } };
    expect(sanitizeStepOutputs(node, step)).not.toHaveProperty("outputs");
  });

  test("does not mutate the original step object", () => {
    const step = { nodeId: "n1", label: "Unknown", status: "success", ms: 1, detail: "ok", outputs: { secret: "do-not-persist" } };
    const result = sanitizeStepOutputs({ id: "n1", defId: "unknown", name: "Unknown", config: {} }, step);
    expect(step.outputs.secret).toBe("do-not-persist");
    expect(result).not.toHaveProperty("outputs");
  });
});
