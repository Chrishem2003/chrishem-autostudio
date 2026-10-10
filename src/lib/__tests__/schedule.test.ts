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
  it("weekly fires only on Monday 09:00", () => {
    expect(isDue("Weekly Mon 09:00", null, at("2026-10-05T09:01:00Z"))).toBe(true);
    expect(isDue("Weekly Mon 09:00", null, at("2026-10-04T09:01:00Z"))).toBe(false);
  });
});
