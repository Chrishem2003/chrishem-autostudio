// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { firstLivePreflightError } from "../live-execution-preflight";

describe("shared live execution capability preflight", () => {
  it("stops at the first failed capability check", async () => {
    const checked: string[] = [];
    const reason = await firstLivePreflightError(
      ["trigger", "send-email", "http-request"],
      "user-1",
      async (node, userId) => {
        expect(userId).toBe("user-1");
        checked.push(node);
        return node === "send-email" ? "Email connection is missing." : null;
      },
    );
    expect(reason).toBe("Email connection is missing.");
    expect(checked).toEqual(["trigger", "send-email"]);
  });

  it("returns null only when every node passes", async () => {
    const checked: string[] = [];
    const reason = await firstLivePreflightError(["trigger", "http-request"], "user-2", async (node) => {
      checked.push(node);
      return null;
    });
    expect(reason).toBeNull();
    expect(checked).toEqual(["trigger", "http-request"]);
  });
});
