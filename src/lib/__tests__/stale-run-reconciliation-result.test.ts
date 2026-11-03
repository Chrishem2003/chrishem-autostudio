// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, test } from "bun:test";
import { isSafeStaleRunReconciliationResult } from "../stale-run-reconciliation-result";

describe("isSafeStaleRunReconciliationResult", () => {
  test("accepts only documented reconciliation outcomes", () => {
    for (const value of ["reconciled", "not_running", "not_stale", "active_lease"]) expect(isSafeStaleRunReconciliationResult(value)).toBe(true);
  });
  test("rejects unknown values without coercion", () => {
    for (const value of [null, undefined, false, 0, {}, [], "unsupported_trigger", "lease_not_owned", "RECONCILED"]) expect(isSafeStaleRunReconciliationResult(value)).toBe(false);
  });
  test("does not invoke hostile string coercion", () => {
    const value = { toString() { throw new Error("must not be called"); } };
    expect(isSafeStaleRunReconciliationResult(value)).toBe(false);
  });
});
