// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { isDurableQueueEnabled, isOutboundTransportReady } from "../runtime-feature-gates";

describe("side-effect rollout gates", () => {
  it("keeps both sensitive capabilities disabled when variables are absent", () => {
    expect(isDurableQueueEnabled({})).toBe(false);
    expect(isOutboundTransportReady({})).toBe(false);
  });

  it("fails closed for misspelled, uppercase, truthy, and whitespace values", () => {
    for (const value of ["TRUE", "1", "yes", " true", "true "]) {
      expect(isDurableQueueEnabled({ AUTOSTUDIO_DURABLE_QUEUE_ENABLED: value })).toBe(false);
      expect(isOutboundTransportReady({ AUTOSTUDIO_OUTBOUND_TRANSPORT_READY: value })).toBe(false);
    }
  });

  it("enables each capability only from its own exact flag", () => {
    expect(isDurableQueueEnabled({ AUTOSTUDIO_DURABLE_QUEUE_ENABLED: "true" })).toBe(true);
    expect(isOutboundTransportReady({ AUTOSTUDIO_OUTBOUND_TRANSPORT_READY: "true" })).toBe(true);
    expect(isDurableQueueEnabled({ AUTOSTUDIO_OUTBOUND_TRANSPORT_READY: "true" })).toBe(false);
    expect(isOutboundTransportReady({ AUTOSTUDIO_DURABLE_QUEUE_ENABLED: "true" })).toBe(false);
  });
});
