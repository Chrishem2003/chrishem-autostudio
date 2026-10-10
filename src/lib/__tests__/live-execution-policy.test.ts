// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { assertLiveExecutionQueueEnabled } from "../live-execution-policy";

describe("live execution rollout policy", () => {
  it("allows live execution only when the durable queue is enabled", () => {
    expect(() => assertLiveExecutionQueueEnabled("live", true)).not.toThrow();
  });

  it("fails closed instead of permitting inline live execution while queue is disabled", () => {
    expect(() => assertLiveExecutionQueueEnabled("live", false))
      .toThrow("durable queue is disabled");
  });

  it("keeps dry-run previews available while the queue is disabled", () => {
    expect(() => assertLiveExecutionQueueEnabled("dry", false)).not.toThrow();
  });
});
