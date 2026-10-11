// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { mapFields } from "../field-mapping";

describe("logic.map field mapping", () => {
  it("maps resolved text into a bounded JSON output", () => {
    const result = mapFields("full_name = Ada Lovelace\nstatus = ready\n# comment");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.parse(result.serialized)).toEqual({ full_name: "Ada Lovelace", status: "ready" });
    }
  });

  it("rejects malformed lines and invalid keys", () => {
    expect(mapFields("this is not a mapping").ok).toBe(false);
    expect(mapFields("not-valid = value").ok).toBe(false);
  });

  it("rejects duplicate keys instead of silently overwriting", () => {
    const result = mapFields("status = first\nstatus = second");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/more than once/i);
  });

  it("enforces field count, per-value, and total serialized output limits", () => {
    expect(mapFields(Array.from({ length: 51 }, (_, i) => `field_${i} = x`).join("\n")).ok).toBe(false);
    expect(mapFields(`note = ${"x".repeat(2_001)}`).ok).toBe(false);
    expect(mapFields(Array.from({ length: 10 }, (_, i) => `field_${i} = ${"x".repeat(1_000)}`).join("\n")).ok).toBe(false);
  });

  it("rejects empty mappings", () => {
    expect(mapFields("  \n# nothing here").ok).toBe(false);
  });
});
