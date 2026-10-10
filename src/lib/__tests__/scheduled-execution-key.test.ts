// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { scheduledExecutionIdempotencyKey } from "../scheduled-execution-key";

describe("scheduled execution idempotency keys", () => {
  const at = (value: string) => new Date(value);

  it("keeps repeated five-minute scheduler calls in one occurrence idempotent", () => {
    expect(scheduledExecutionIdempotencyKey("auto-1", "Every 5 min", at("2026-10-11T06:00:01Z")))
      .toBe(scheduledExecutionIdempotencyKey("auto-1", "Every 5 min", at("2026-10-11T06:04:59Z")));
  });

  it("uses one key for repeated hourly checks within the same hour", () => {
    expect(scheduledExecutionIdempotencyKey("auto-1", "Hourly", at("2026-10-11T06:01:00Z")))
      .toBe(scheduledExecutionIdempotencyKey("auto-1", "Hourly", at("2026-10-11T06:59:59Z")));
  });

  it("uses the schedule timezone's local date for daily occurrences", () => {
    expect(scheduledExecutionIdempotencyKey("auto-1", "Daily 08:00", at("2026-10-11T05:00:00Z"), "Africa/Nairobi"))
      .toBe(scheduledExecutionIdempotencyKey("auto-1", "Daily 08:00", at("2026-10-11T05:04:59Z"), "Africa/Nairobi"));
  });

  it("uses the local calendar date for weekly occurrences and safely falls back on invalid timezones", () => {
    expect(scheduledExecutionIdempotencyKey("auto-1", "Weekly Mon 09:00", at("2026-10-12T06:00:00Z"), "Africa/Nairobi"))
      .toBe(scheduledExecutionIdempotencyKey("auto-1", "Weekly Mon 09:00", at("2026-10-12T06:04:00Z"), "Africa/Nairobi"));
    expect(scheduledExecutionIdempotencyKey("auto-1", "Daily 08:00", at("2026-10-11T05:00:00Z"), "Not/A_Timezone"))
      .toBe(scheduledExecutionIdempotencyKey("auto-1", "Daily 08:00", at("2026-10-11T05:04:00Z"), "UTC"));
  });

  it("rejects unknown cadence, invalid timestamps, and invalid identifiers", () => {
    expect(() => scheduledExecutionIdempotencyKey(" ", "Hourly", at("2026-10-11T06:00:00Z"))).toThrow();
    expect(() => scheduledExecutionIdempotencyKey("auto-1", "Yearly", at("2026-10-11T06:00:00Z"))).toThrow();
    expect(() => scheduledExecutionIdempotencyKey("auto-1", "Hourly", new Date(Number.NaN))).toThrow();
  });

  it("changes keys between occurrence windows", () => {
    expect(scheduledExecutionIdempotencyKey("auto-1", "Every 5 min", at("2026-10-11T06:00:00Z")))
      .not.toBe(scheduledExecutionIdempotencyKey("auto-1", "Every 5 min", at("2026-10-11T06:05:00Z")));
    expect(scheduledExecutionIdempotencyKey("auto-1", "Daily 08:00", at("2026-10-11T05:00:00Z"), "UTC"))
      .not.toBe(scheduledExecutionIdempotencyKey("auto-1", "Daily 08:00", at("2026-10-12T05:00:00Z"), "UTC"));
  });
});
