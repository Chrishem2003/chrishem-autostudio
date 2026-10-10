// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { scheduledExecutionIdempotencyKey } from "../scheduled-execution-key";

describe("scheduled execution idempotency keys", () => {
  const at = (value: string) => new Date(value);

  it("keeps concurrent producer calls in one scheduled generation idempotent", () => {
    const lastRunAt = at("2026-10-11T05:00:00Z");
    expect(scheduledExecutionIdempotencyKey("auto-1", "Every 5 min", lastRunAt))
      .toBe(scheduledExecutionIdempotencyKey("auto-1", "Every 5 min", lastRunAt));
  });

  it("creates a stable first-run key when no prior run marker exists", () => {
    expect(scheduledExecutionIdempotencyKey("auto-1", "Hourly", null))
      .toBe(scheduledExecutionIdempotencyKey("auto-1", "Hourly", null));
  });

  it("opens a new generation after the last-run marker advances, even within one wall-clock hour", () => {
    expect(scheduledExecutionIdempotencyKey("auto-1", "Hourly", at("2026-10-11T06:01:00Z")))
      .not.toBe(scheduledExecutionIdempotencyKey("auto-1", "Hourly", at("2026-10-11T06:56:00Z")));
  });

  it("separates automation and cadence identities", () => {
    const marker = at("2026-10-11T05:00:00Z");
    expect(scheduledExecutionIdempotencyKey("auto-1", "Hourly", marker))
      .not.toBe(scheduledExecutionIdempotencyKey("auto-2", "Hourly", marker));
    expect(scheduledExecutionIdempotencyKey("auto-1", "Hourly", marker))
      .not.toBe(scheduledExecutionIdempotencyKey("auto-1", "Every 5 min", marker));
  });

  it("rejects unknown cadence, invalid identifiers, and invalid marker dates", () => {
    expect(() => scheduledExecutionIdempotencyKey(" ", "Hourly", null)).toThrow();
    expect(() => scheduledExecutionIdempotencyKey("auto-1", "Yearly", null)).toThrow();
    expect(() => scheduledExecutionIdempotencyKey("auto-1", "Hourly", new Date(Number.NaN))).toThrow();
  });
});
