// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { classifyExecutionOutcome } from "../execution-outcome";

describe("external step outcome certainty", () => {
  it("marks successful steps as confirmed", () => {
    expect(classifyExecutionOutcome("success", "HTTP 200 response")).toBe("confirmed");
  });

  it("marks dry runs as not attempted", () => {
    expect(classifyExecutionOutcome("dry_run", "Dry run only")).toBe("not_attempted");
  });

  it("marks transport failures as uncertain", () => {
    expect(classifyExecutionOutcome("failed", "Couldn't reach example.com. Tried 1 times")).toBe("uncertain");
    expect(classifyExecutionOutcome("failed", "No reply within 30s.")).toBe("uncertain");
  });

  it("marks provider 5xx failures as uncertain", () => {
    expect(classifyExecutionOutcome("failed", "Webhook delivery failed (HTTP 503).")).toBe("uncertain");
    expect(classifyExecutionOutcome("failed", "Gmail refused the email (HTTP 500).")).toBe("uncertain");
  });

  it("marks preflight/configuration failures as not attempted", () => {
    expect(classifyExecutionOutcome("failed", "Gmail is not connected.")).toBe("not_attempted");
    expect(classifyExecutionOutcome("failed", "Unsupported HTTP method.")).toBe("not_attempted");
  });

  it("treats thrown executor errors and missing audit writes conservatively", () => {
    expect(classifyExecutionOutcome("failed", "The step stopped unexpectedly. Its external outcome may be uncertain; verify the destination before retrying.")).toBe("uncertain");
    expect(classifyExecutionOutcome("failed", "The step result could not be safely recorded. Stop and verify external effects before retrying.")).toBe("uncertain");
  });
});
