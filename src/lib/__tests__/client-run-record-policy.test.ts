// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, test } from "bun:test";
import { assertClientRunRecordIsDryRun } from "../client-run-record-policy";

describe("client-submitted run record policy", () => {
  test("allows client-submitted dry-run previews", () => {
    expect(() => assertClientRunRecordIsDryRun(true)).not.toThrow();
  });

  test("rejects client-submitted live run records", () => {
    expect(() => assertClientRunRecordIsDryRun(false)).toThrow(
      "Live audit records are written only by the durable execution worker",
    );
  });
});
