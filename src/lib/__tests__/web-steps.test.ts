// @ts-nocheck -- vitest types are resolved at test time
import { describe, it, expect } from "vitest";
import { isBlockedHost } from "../web-steps.server";
describe("web step address rules", () => {
  it("blocks localhost", () => expect(isBlockedHost("localhost")).toBe(true));
  it("blocks private 10.x", () => expect(isBlockedHost("10.1.2.3")).toBe(true));
  it("blocks 192.168.x", () => expect(isBlockedHost("192.168.0.5")).toBe(true));
  it("blocks cloud metadata 169.254", () => expect(isBlockedHost("169.254.169.254")).toBe(true));
  it("allows public hosts", () => expect(isBlockedHost("api.example.com")).toBe(false));
});
