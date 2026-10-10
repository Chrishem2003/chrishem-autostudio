// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { assertDirectProviderExecutionDisabled } from "../direct-execution-policy";

describe("legacy direct provider execution policy", () => {
  it("always blocks direct provider calls so they cannot bypass durable queue controls", () => {
    expect(() => assertDirectProviderExecutionDisabled()).toThrow(
      "Direct provider execution is disabled",
    );
  });
});
