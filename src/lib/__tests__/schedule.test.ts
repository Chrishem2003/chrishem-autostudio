// @ts-nocheck -- vitest types are resolved at test time
import { describe, it, expect } from "bun:test";
import { isDue } from "../schedule";

const at = (iso: string) => new Date(iso);
describe("schedule rules", () => {
  it("every 5 min runs when never run", () => expect(isDue("Every 5 min", null, at("2026-10-04T06:00:00Z"))).toBe(true));
  it("every 5 min waits after a recent run", () =>
    expect(isDue("Every 5 min", at("2026-10-04T05:58:00Z"), at("2026-10-04T06:00:00Z"))).toBe(false));
  it("hourly waits under an hour", () => expect(isDue("Hourly", at("2026-10-04T05:30:00Z"), at("2026-10-04T06:00:00Z"))).toBe(false));
  it("daily 08:00 fires at 08:00 Nairobi (05:00 UTC)", () =>
    expect(isDue("Daily 08:00", null, at("2026-10-04T05:02:00Z"), "Africa/Nairobi")).toBe(true));
  it("daily 08:00 does not fire at 08:00 UTC for Nairobi", () =>
    expect(isDue("Daily 08:00", null, at("2026-10-04T08:02:00Z"), "Africa/Nairobi")).toBe(false));
  it("every 5 min becomes due at the 4.5-minute threshold, not before", () => {
    const last = at("2026-10-04T06:00:00Z");
    expect(isDue("Every 5 min", last, at("2026-10-04T06:04:29Z"))).toBe(false);
    expect(isDue("Every 5 min", last, at("2026-10-04T06:04:30Z"))).toBe(true);
  });
  it("hourly becomes due at the 55-minute threshold, not before", () => {
    const last = at("2026-10-04T05:00:00Z");
    expect(isDue("Hourly", last, at("2026-10-04T05:54:59Z"))).toBe(false);
    expect(isDue("Hourly", last, at("2026-10-04T05:55:00Z"))).toBe(true);
  });
  it("invalid timezone safely falls back to UTC", () => {
    expect(isDue("Daily 08:00", null, at("2026-10-04T08:02:00Z"), "Invalid/Timezone")).toBe(true);
    expect(isDue("Daily 08:00", null, at("2026-10-04T05:02:00Z"), "Invalid/Timezone")).toBe(false);
  });
  it("weekly fires only on Monday 09:00", () => {
    expect(isDue("Weekly Mon 09:00", null, at("2026-10-05T09:01:00Z"))).toBe(true);
    expect(isDue("Weekly Mon 09:00", null, at("2026-10-04T09:01:00Z"))).toBe(false);
  });
});
