// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, test } from "bun:test";
import { executionRetryAt } from "../execution-retry-schedule";

describe("execution retry schedule", () => {
  test("uses increasing bounded delays for safe retries", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(executionRetryAt(1, now)).toBe("2026-01-01T00:00:05.000Z");
    expect(executionRetryAt(2, now)).toBe("2026-01-01T00:00:30.000Z");
    expect(executionRetryAt(3, now)).toBe("2026-01-01T00:02:00.000Z");
    expect(executionRetryAt(4, now)).toBe("2026-01-01T00:10:00.000Z");
  });

  test("caps long retry sequences at one hour", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(executionRetryAt(6, now)).toBe("2026-01-01T01:00:00.000Z");
    expect(executionRetryAt(10, now)).toBe("2026-01-01T01:00:00.000Z");
  });

  test("rejects invalid attempts and invalid clocks", () => {
    for (const attempts of [0, -1, 1.5, 11]) {
      expect(() => executionRetryAt(attempts)).toThrow(/attempts must be an integer/i);
    }
    expect(() => executionRetryAt(1, new Date(Number.NaN))).toThrow(/valid date/i);
  });
});
