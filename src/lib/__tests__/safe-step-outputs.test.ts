// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { sanitizeStepOutputs } from "../safe-step-outputs";

const node = (defId, id = "step") => ({ id, defId, name: id, x: 0, y: 0, config: {} });
const step = (outputs) => ({ nodeId: "step", label: "step", status: "success", ms: 1, detail: "ok", outputs });

describe("safe step output boundary", () => {
  it("persists only declared fields and strips arbitrary response bodies and credentials", () => {
    const result = sanitizeStepOutputs(node("action.http"), step({
      httpStatus: 201,
      responseBody: "private response",
      access_token: "super-secret",
      authorization: "Bearer super-secret",
    }));
    expect(result.outputs).toEqual({ httpStatus: 201 });
    expect(JSON.stringify(result)).not.toContain("super-secret");
    expect(JSON.stringify(result)).not.toContain("private response");
  });

  it("rejects malformed values for declared output fields", () => {
    const result = sanitizeStepOutputs(node("action.http"), step({
      httpStatus: 9999,
      responseBody: "secret",
    }));
    expect(result.outputs).toBeUndefined();
  });

  it("bounds and validates Gmail provider message identifiers", () => {
    const valid = sanitizeStepOutputs(node("action.gmail"), step({ accepted: true, providerMessageId: "msg_123", access_token: "secret" }));
    expect(valid.outputs).toEqual({ accepted: true, providerMessageId: "msg_123" });
    const invalid = sanitizeStepOutputs(node("action.gmail"), step({ accepted: true, providerMessageId: "Bearer secret" }));
    expect(invalid.outputs).toEqual({ accepted: true });
  });

  it("drops outputs from steps with no reviewed connector contract", () => {
    const result = sanitizeStepOutputs(node("action.test"), step({ secret: "secret" }));
    expect(result.outputs).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
