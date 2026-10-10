// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, it, expect } from "bun:test";
import { isBlockedHost, resolvePublicTarget } from "../web-steps.server";

describe("web step address rules", () => {
  it("blocks localhost and local-only hostnames", () => {
    expect(isBlockedHost("localhost")).toBe(true);
    expect(isBlockedHost("service.internal")).toBe(true);
    expect(isBlockedHost("printer.local")).toBe(true);
  });
  it("blocks private, loopback, link-local and carrier-grade NAT IPv4", () => {
    expect(isBlockedHost("10.1.2.3")).toBe(true);
    expect(isBlockedHost("127.0.0.1")).toBe(true);
    expect(isBlockedHost("192.168.0.5")).toBe(true);
    expect(isBlockedHost("169.254.169.254")).toBe(true);
    expect(isBlockedHost("100.64.0.1")).toBe(true);
    expect(isBlockedHost("172.31.255.255")).toBe(true);
  });
  it("blocks IPv4-mapped IPv6 in dotted and hexadecimal forms", () => {
    expect(isBlockedHost("[::ffff:127.0.0.1]")).toBe(true);
    expect(isBlockedHost("[::ffff:7f00:1]")).toBe(true);
    expect(isBlockedHost("::ffff:c0a8:101")).toBe(true);
  });
  it("blocks non-global IPv6 and malformed literals", () => {
    expect(isBlockedHost("::")).toBe(true);
    expect(isBlockedHost("::1")).toBe(true);
    expect(isBlockedHost("fd12::1")).toBe(true);
    expect(isBlockedHost("fe80::1")).toBe(true);
    expect(isBlockedHost("ff02::1")).toBe(true);
    expect(isBlockedHost("2001:db8::1")).toBe(true);
    expect(isBlockedHost("2002:c000:0201::1")).toBe(true);
    expect(isBlockedHost("2001::1::2")).toBe(true);
  });
  it("does not confuse public hostnames with IPv6 prefixes", () => {
    expect(isBlockedHost("fdic.gov")).toBe(false);
    expect(isBlockedHost("fcc.gov")).toBe(false);
    expect(isBlockedHost("api.example.com")).toBe(false);
  });
  it("allows a global-unicast IPv6 literal", () => {
    expect(isBlockedHost("2001:4860:4860::8888")).toBe(false);
  });
  it("rejects a hostname resolving to a private address", async () => {
    await expect(resolvePublicTarget("rebind.example", async () => [
      { address: "10.0.0.5", family: 4 },
    ])).rejects.toThrow(/private/i);
  });
  it("rejects mixed DNS answers when any address is private", async () => {
    await expect(resolvePublicTarget("mixed.example", async () => [
      { address: "203.0.113.7", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ])).rejects.toThrow(/private/i);
  });
  it("pins the first validated DNS address", async () => {
    await expect(resolvePublicTarget("public.example", async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "2001:4860:4860::8888", family: 6 },
    ])).resolves.toEqual({ address: "8.8.8.8", family: 4 });
  });
});
