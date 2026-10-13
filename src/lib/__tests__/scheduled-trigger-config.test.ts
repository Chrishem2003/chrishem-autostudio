// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { normalizeScheduledTriggerConfig } from "../scheduled-trigger-config";

describe("normalizeScheduledTriggerConfig", () => {
  it("uses the established default cadence and UTC timezone for missing values", () => {
    expect(normalizeScheduledTriggerConfig({})).toEqual({
      cadence: "Hourly",
      timezone: "UTC",
    });
  });

  it("accepts supported cadence and a valid IANA timezone", () => {
    expect(normalizeScheduledTriggerConfig({
      cadence: "Daily 08:00",
      timezone: "Africa/Kampala",
    })).toEqual({
      cadence: "Daily 08:00",
      timezone: "Africa/Kampala",
    });
  });

  it("rejects unknown cadence values instead of silently disabling a live schedule", () => {
    expect(normalizeScheduledTriggerConfig({ cadence: "Yearly" })).toBeNull();
    expect(normalizeScheduledTriggerConfig({ cadence: 5 })).toBeNull();
  });

  it("normalizes invalid timezone values to UTC", () => {
    expect(normalizeScheduledTriggerConfig({
      cadence: "Hourly",
      timezone: "Not/A_Real_Zone",
    })).toEqual({
      cadence: "Hourly",
      timezone: "UTC",
    });
  });

  it("rejects non-object config values", () => {
    for (const value of [null, undefined, [], "Hourly", 7]) {
      expect(normalizeScheduledTriggerConfig(value)).toBeNull();
    }
  });
});
