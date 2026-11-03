// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, test } from "bun:test";
import {
  OUTBOUND_TRANSPORT_DISABLED_MESSAGE,
  outboundTransportGateError,
} from "../outbound-transport-gate";

describe("outboundTransportGateError", () => {
  test("fails closed when the transport flag is absent or malformed", () => {
    expect(outboundTransportGateError({})).toBe(OUTBOUND_TRANSPORT_DISABLED_MESSAGE);
    for (const value of ["", "false", "TRUE", "1", "yes", " true "]) {
      expect(outboundTransportGateError({ AUTOSTUDIO_OUTBOUND_TRANSPORT_READY: value }))
        .toBe(OUTBOUND_TRANSPORT_DISABLED_MESSAGE);
    }
  });

  test("accepts only the literal true value", () => {
    expect(outboundTransportGateError({ AUTOSTUDIO_OUTBOUND_TRANSPORT_READY: "true" })).toBeNull();
  });
});
