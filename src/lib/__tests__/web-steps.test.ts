// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, it, expect } from "bun:test";
import { isBlockedHost, isRetrySafeMethod, resolvePublicTarget, summarizeWebResponse } from "../web-steps.server";

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
    expect(isBlockedHost("192.31.196.10")).toBe(true);
    expect(isBlockedHost("192.52.193.10")).toBe(true);
    expect(isBlockedHost("192.175.48.10")).toBe(true);
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
    expect(isBlockedHost("3fff::1")).toBe(true);
    expect(isBlockedHost("3fff:0fff::1")).toBe(true);
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
      { address: "8.8.8.8", family: 4 },
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


describe("outbound retry safety", () => {
  it("retries only idempotent HTTP methods automatically", () => {
    expect(isRetrySafeMethod("GET")).toBe(true);
    expect(isRetrySafeMethod("PUT")).toBe(true);
    expect(isRetrySafeMethod("DELETE")).toBe(true);
    expect(isRetrySafeMethod("POST")).toBe(false);
    expect(isRetrySafeMethod("PATCH")).toBe(false);
  });
});


describe("remote response audit summaries", () => {
  it("summarizes successful responses without including provider response bodies", () => {
    expect(summarizeWebResponse(200, "api.example.com")).toBe("200 from api.example.com.");
    expect(summarizeWebResponse(201, "api.example.com", true)).toBe("201 from api.example.com (succeeded after retry).");
  });

  it("summarizes error responses without including remote payloads", () => {
    const detail = summarizeWebResponse(500, "api.example.com");
    expect(detail).toContain("refused the request (500)");
    expect(detail).not.toContain("access_token");
    expect(detail).not.toContain("private customer payload");
  });
});

describe("outbound transport rollout gate", () => {
  it("does not send a request while the transport readiness flag is absent", async () => {
    const previous = process.env["AUTOSTUDIO_OUTBOUND_TRANSPORT_READY"];
    delete process.env["AUTOSTUDIO_OUTBOUND_TRANSPORT_READY"];
    try {
      const { callWeb } = await import("../web-steps.server");
      const result = await callWeb({
        method: "GET",
        url: "https://example.com/health",
        timeoutSec: 2,
      });
      expect(result).toEqual({
        ok: false,
        status: 0,
        ms: 0,
        attempts: 0,
        detail: "Outbound HTTP transport is not runtime-verified; no request was sent.",
      });
    } finally {
      if (previous === undefined) delete process.env["AUTOSTUDIO_OUTBOUND_TRANSPORT_READY"];
      else process.env["AUTOSTUDIO_OUTBOUND_TRANSPORT_READY"] = previous;
    }
  });
});


describe("outbound HTTP preflight rejects unsafe requests before DNS or network access", () => {
  async function withReadyTransport<T>(run: () => Promise<T>): Promise<T> {
    const previous = process.env["AUTOSTUDIO_OUTBOUND_TRANSPORT_READY"];
    process.env["AUTOSTUDIO_OUTBOUND_TRANSPORT_READY"] = "true";
    try {
      return await run();
    } finally {
      if (previous === undefined) delete process.env["AUTOSTUDIO_OUTBOUND_TRANSPORT_READY"];
      else process.env["AUTOSTUDIO_OUTBOUND_TRANSPORT_READY"] = previous;
    }
  }

  it("rejects non-HTTP schemes without attempting a request", async () => {
    await withReadyTransport(async () => {
      const { callWeb } = await import("../web-steps.server");
      const result = await callWeb({ method: "GET", url: "file:///etc/passwd", timeoutSec: 2 });
      expect(result.ok).toBe(false);
      expect(result.attempts).toBe(0);
      expect(result.detail).toMatch(/Only http\/https/i);
    });
  });

  it("rejects embedded credentials before resolving the host", async () => {
    await withReadyTransport(async () => {
      const { callWeb } = await import("../web-steps.server");
      const result = await callWeb({ method: "GET", url: "https://user:secret@example.com/path", timeoutSec: 2 });
      expect(result.ok).toBe(false);
      expect(result.attempts).toBe(0);
      expect(result.detail).toMatch(/embedded usernames or passwords/i);
      expect(result.detail).not.toContain("secret");
    });
  });

  it("rejects unsupported HTTP methods before resolving the host", async () => {
    await withReadyTransport(async () => {
      const { callWeb } = await import("../web-steps.server");
      const result = await callWeb({ method: "TRACE", url: "https://example.com/", timeoutSec: 2 });
      expect(result.ok).toBe(false);
      expect(result.attempts).toBe(0);
      expect(result.detail).toMatch(/method isn't supported/i);
    });
  });

  it("rejects oversized request bodies before resolving the host", async () => {
    await withReadyTransport(async () => {
      const { callWeb } = await import("../web-steps.server");
      const result = await callWeb({
        method: "POST",
        url: "https://example.com/",
        body: "x".repeat(65_537),
        timeoutSec: 2,
      });
      expect(result.ok).toBe(false);
      expect(result.attempts).toBe(0);
      expect(result.detail).toMatch(/64 KB safety limit/i);
    });
  });
});
