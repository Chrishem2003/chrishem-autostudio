import { describe, expect, test } from "bun:test";
import { parseStaleExecutionRunReferences } from "../stale-execution-run-references";

describe("parseStaleExecutionRunReferences", () => {
  test("accepts an empty list and valid run references", () => {
    expect(parseStaleExecutionRunReferences([])).toEqual({ success: true, runs: [] });
    expect(parseStaleExecutionRunReferences([{ id: "run-1" }, { id: "run-2" }])).toEqual({ success: true, runs: [{ id: "run-1" }, { id: "run-2" }] });
  });

  test("rejects null, non-arrays, and malformed row identifiers", () => {
    for (const value of [null, undefined, {}, "", [{ id: "" }], [{ id: " " }], [{ id: 42 }], [{ id: "r".repeat(201) }], [null], [[]]]) {
      expect(parseStaleExecutionRunReferences(value).success).toBe(false);
    }
  });

  test("fails closed when a row identifier getter throws", () => {
    const row = {};
    Object.defineProperty(row, "id", { get() { throw new Error("untrusted row getter"); } });
    expect(parseStaleExecutionRunReferences([row])).toEqual({ success: false, error: "Stale-run query returned an unreadable row." });
  });
});
