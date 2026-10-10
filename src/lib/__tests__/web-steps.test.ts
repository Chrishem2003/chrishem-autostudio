// @ts-nocheck -- vitest types are resolved at test time
import { describe, it, expect } from "vitest";
import { isBlockedHost } from "../web-steps.server";

describe("web step address rules", () => {
  it("blocks localhost", () => expect(isBlockedHost("localhost")).toBe(true));
  it("blocks private 10.x", () => expect(isBlockedHost("10.1.2.3")).toBe(true));
  it("blocks 192.168.x", () => expect(isBlockedHost("192.168.0.5")).toBe(true));
  it("blocks cloud metadata 169.254", () => expect(isBlockedHost("169.254.169.254")).toBe(true));
  it("blocks IPv4-mapped IPv6 loopback in hexadecimal form", () => expect(isBlockedHost("[::ffff:7f00:1]")).toBe(true));
  it("blocks IPv4-mapped IPv6 private addresses", () => expect(isBlockedHost("::ffff:c0a8:101")).toBe(true));
  it("blocks unique-local IPv6", () => expect(isBlockedHost("fd12::1")).toBe(true));
  it("blocks link-local IPv6", () => expect(isBlockedHost("fe80::1")).toBe(true));
  it("allows public hosts that start with fd", () => expect(isBlockedHost("fdic.gov")).toBe(false));
  it("allows public hosts that start with fc", () => expect(isBlockedHost("fcc.gov")).toBe(false));
  it("allows public hosts", () => expect(isBlockedHost("api.example.com")).toBe(false));
});
