// @ts-nocheck -- vitest types are resolved at test time
import { describe, it, expect } from "vitest";
import { isBlockedHost, resolvePublicTarget } from "../web-steps.server";
describe("web step address rules", () => {
  it("blocks localhost", () => expect(isBlockedHost("localhost")).toBe(true));
  it("blocks private 10.x", () => expect(isBlockedHost("10.1.2.3")).toBe(true));
  it("blocks 192.168.x", () => expect(isBlockedHost("192.168.0.5")).toBe(true));
  it("blocks cloud metadata 169.254", () => expect(isBlockedHost("169.254.169.254")).toBe(true));
  it("allows public hosts", () => expect(isBlockedHost("api.example.com")).toBe(false));
});

describe("web step IPv6 address rules", () => {
  it.each([
    ["IPv6 loopback", "::1"],
    ["unique-local IPv6", "fc00::1"],
    ["link-local IPv6", "fe80::1"],
    ["IPv4-mapped loopback", "::ffff:127.0.0.1"],
    ["IPv4-mapped private address", "::ffff:192.168.1.10"],
    ["6to4 transition address", "2002:0808:0808::1"],
    ["IPv6 documentation address", "2001:db8::1"],
    ["malformed IPv6 literal", "2001:::1"],
  ])("blocks %s", (_label, address) => {
    expect(isBlockedHost(address)).toBe(true);
  });

  it("allows a globally routable IPv6 address", () => {
    expect(isBlockedHost("2001:4860:4860::8888")).toBe(false);
  });

  it("allows an IPv4-mapped globally routable address", () => {
    expect(isBlockedHost("::ffff:8.8.8.8")).toBe(false);
  });
});

describe("web step DNS pinning", () => {
  it("rejects a hostname if any DNS answer is private, even when another answer is public", async () => {
    await expect(resolvePublicTarget("mixed.example", async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ])).rejects.toThrow(/private|local|special-use/i);
  });

  it("pins a hostname to one validated public DNS answer", async () => {
    const target = await resolvePublicTarget("public.example", async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "2001:4860:4860::8888", family: 6 },
    ]);
    expect(target).toEqual({ address: "8.8.8.8", family: 4 });
  });

  it("rejects an empty DNS answer", async () => {
    await expect(resolvePublicTarget("empty.example", async () => []))
      .rejects.toThrow(/private|local|special-use/i);
  });

  it("rejects a malformed DNS address instead of passing it to the request layer", async () => {
    await expect(resolvePublicTarget("malformed.example", async () => [
      { address: "not-an-ip", family: 4 },
    ])).rejects.toThrow(/private|local|special-use|valid IP/i);
  });
});
