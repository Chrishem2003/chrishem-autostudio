// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, test } from "bun:test";
import { buildAppUserConnectorUrl, buildAppUserGatewayUrl, validateOAuthAuthorizationUrl } from "../../integrations/lovable/appUserConnector";

describe("validateOAuthAuthorizationUrl", () => {
  test("accepts the Google OAuth authorization endpoint", () => {
    expect(validateOAuthAuthorizationUrl("https://accounts.google.com/o/oauth2/v2/auth?client_id=test"))
      .toBe("https://accounts.google.com/o/oauth2/v2/auth?client_id=test");
  });

  test("rejects non-HTTPS, untrusted hosts and unrelated paths", () => {
    for (const value of [
      "http://accounts.google.com/o/oauth2/v2/auth",
      "https://accounts.google.com.evil.test/o/oauth2/v2/auth",
      "https://evil.test/o/oauth2/v2/auth",
      "https://accounts.google.com/redirect",
      "javascript:alert(1)",
      "not a URL",
    ]) {
      expect(() => validateOAuthAuthorizationUrl(value)).toThrow();
    }
  });
});

describe("buildAppUserConnectorUrl", () => {
  test("builds a connector-scoped URL on the configured HTTPS origin", () => {
    expect(buildAppUserConnectorUrl("https://connector-gateway.lovable.dev", "google_mail", "/gmail/v1/users/me/profile"))
      .toBe("https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/profile");
  });

  test("rejects unsafe gateway origins and connector identifiers", () => {
    for (const [gateway, connector] of [
      ["http://evil.test", "google_mail"],
      ["https://user:pass@connector-gateway.lovable.dev", "google_mail"],
      ["https://connector-gateway.lovable.dev/base", "google_mail"],
      ["https://connector-gateway.lovable.dev", "../other"],
      ["https://connector-gateway.lovable.dev", "google_mail/other"],
    ]) {
      expect(() => buildAppUserConnectorUrl(gateway, connector, "/profile")).toThrow();
    }
  });

  test("rejects absolute, protocol-relative, traversal and control-character paths", () => {
    for (const path of [
      "https://evil.test/steal",
      "//evil.test/steal",
      "/../other/profile",
      "/%2e%2e/other/profile",
      "/%2f%2fevil.test",
      "/\\\\evil.test/profile",
      "/profile#fragment",
      "/profile" + String.fromCharCode(10) + "X-Injected: yes",
    ]) {
      expect(() => buildAppUserConnectorUrl("https://connector-gateway.lovable.dev", "google_mail", path)).toThrow();
    }
  });
});

describe("buildAppUserGatewayUrl", () => {
  test("builds only approved App User gateway endpoints", () => {
    expect(buildAppUserGatewayUrl("https://connector-gateway.lovable.dev", "/api/v1/app-users/connection"))
      .toBe("https://connector-gateway.lovable.dev/api/v1/app-users/connection");
  });

  test("rejects untrusted origins and escaped gateway paths", () => {
    for (const [gateway, path] of [
      ["https://evil.test", "/api/v1/app-users/connection"],
      ["http://connector-gateway.lovable.dev", "/api/v1/app-users/connection"],
      ["https://user:pass@connector-gateway.lovable.dev", "/api/v1/app-users/connection"],
      ["https://connector-gateway.lovable.dev:8443", "/api/v1/app-users/connection"],
      ["https://connector-gateway.lovable.dev", "//evil.test/api/v1/app-users/connection"],
      ["https://connector-gateway.lovable.dev", "/api/v1/app-users/../other"],
      ["https://connector-gateway.lovable.dev", "/api/v1/app-users/%2e%2e/other"],
    ]) {
      expect(() => buildAppUserGatewayUrl(gateway, path)).toThrow();
    }
  });
});
