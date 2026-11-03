// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { afterEach, describe, expect, test } from "bun:test";
import { decryptConnectionKey, encryptConnectionKey, isConnectionVerificationFresh } from "../app-user-connections.server";

const originalKey = process.env["APP_USER_CONNECTION_KEY_SECRET"];

afterEach(() => {
  if (originalKey === undefined) delete process.env["APP_USER_CONNECTION_KEY_SECRET"];
  else process.env["APP_USER_CONNECTION_KEY_SECRET"] = originalKey;
});

describe("app user connection credential encryption", () => {
  test("round-trips a credential with a canonical 32-byte key", () => {
    process.env["APP_USER_CONNECTION_KEY_SECRET"] = Buffer.alloc(32, 7).toString("base64");
    const encrypted = encryptConnectionKey("provider-secret-value");
    expect(encrypted).not.toContain("provider-secret-value");
    expect(decryptConnectionKey(encrypted)).toBe("provider-secret-value");
  });

  test("rejects missing, malformed and wrong-sized encryption keys", () => {
    delete process.env["APP_USER_CONNECTION_KEY_SECRET"];
    expect(() => encryptConnectionKey("credential")).toThrow("APP_USER_CONNECTION_KEY_SECRET is not set");

    for (const value of ["not-base64!", Buffer.alloc(16, 1).toString("base64"), Buffer.alloc(32, 2).toString("base64").replace(/=$/, "")]) {
      process.env["APP_USER_CONNECTION_KEY_SECRET"] = value;
      expect(() => encryptConnectionKey("credential")).toThrow("exactly 32 bytes");
    }
  });

  test("rejects malformed, truncated and tampered ciphertext envelopes", () => {
    process.env["APP_USER_CONNECTION_KEY_SECRET"] = Buffer.alloc(32, 9).toString("base64");
    for (const value of ["", "not-base64!", Buffer.alloc(20, 1).toString("base64")]) {
      expect(() => decryptConnectionKey(value)).toThrow();
    }
    const encrypted = encryptConnectionKey("provider-secret-value");
    const bytes = Buffer.from(encrypted, "base64");
    bytes[bytes.length - 1] ^= 1;
    expect(() => decryptConnectionKey(bytes.toString("base64"))).toThrow("could not be decrypted");
  });
});

describe("provider verification freshness", () => {
  const now = Date.parse("2026-11-03T12:00:00.000Z");

  test("accepts a recent verification but rejects expired, future and malformed timestamps", () => {
    expect(isConnectionVerificationFresh("2026-11-03T11:59:59.000Z", now)).toBe(true);
    expect(isConnectionVerificationFresh("2026-10-04T11:59:59.000Z", now)).toBe(false);
    expect(isConnectionVerificationFresh("2026-11-03T12:00:01.000Z", now)).toBe(false);
    expect(isConnectionVerificationFresh("not-a-date", now)).toBe(false);
    expect(isConnectionVerificationFresh(null, now)).toBe(false);
  });

  test("rejects an invalid clock value", () => {
    expect(isConnectionVerificationFresh("2026-11-03T11:00:00.000Z", Number.NaN)).toBe(false);
  });
});
