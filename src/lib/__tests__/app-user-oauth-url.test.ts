// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, test } from "bun:test";
import { validateOAuthAuthorizationUrl } from "../../integrations/lovable/appUserConnector";

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
