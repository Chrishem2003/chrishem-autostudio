// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { validateStepMappings } from "../validate-step-mappings";

const node = (id, defId, config = {}) => ({ id, defId, name: id, x: 0, y: 0, config });

describe("whole-flow mapping preflight", () => {
  it("accepts only declared outputs from earlier connector steps", () => {
    const result = validateStepMappings([
      node("request", "action.http"),
      node("email", "action.gmail", { subject: "Status {{steps.request.httpStatus}}" }),
    ]);
    expect(result).toBeNull();
  });

  it("rejects a reference to a trigger or unsupported output before execution", () => {
    const result = validateStepMappings([
      node("trigger", "trigger.manual"),
      node("email", "action.gmail", { body: "{{steps.trigger.accepted}}" }),
    ]);
    expect(result?.error).toMatch(/not an earlier step|not a declared output/i);
  });

  it("rejects dynamic values in security-sensitive configuration", () => {
    const result = validateStepMappings([
      node("request", "action.http", { url: "{{steps.prior.httpStatus}}" }),
    ]);
    expect(result?.error).toMatch(/mapping is not allowed/i);
  });

  it("rejects malformed and unsupported tokens", () => {
    const result = validateStepMappings([
      node("request", "action.http"),
      node("email", "action.gmail", { body: "value {{steps.request.httpStatus" }),
    ]);
    expect(result?.error).toMatch(/invalid or unsupported data token/i);
  });

  it("rejects unknown output fields even when the source step exists", () => {
    const result = validateStepMappings([
      node("request", "action.http"),
      node("email", "action.gmail", { body: "{{steps.request.responseBody}}" }),
    ]);
    expect(result?.error).toMatch(/not a declared output/i);
  });
});
