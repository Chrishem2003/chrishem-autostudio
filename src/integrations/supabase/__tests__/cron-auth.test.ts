// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { afterEach, describe, expect, it } from "bun:test";
import { authenticateCronRequest } from "../cron-auth";

const originalCurrent = process.env.LOVABLE_CRON_SECRET;
const originalPrevious = process.env.LOVABLE_CRON_SECRET_PREVIOUS;

function request(authorization?: string) {
  return new Request("https://autostudio.test/api/public/cron/run-execution-job", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });
}

afterEach(() => {
  if (originalCurrent === undefined) delete process.env.LOVABLE_CRON_SECRET;
  else process.env.LOVABLE_CRON_SECRET = originalCurrent;
  if (originalPrevious === undefined) delete process.env.LOVABLE_CRON_SECRET_PREVIOUS;
  else process.env.LOVABLE_CRON_SECRET_PREVIOUS = originalPrevious;
});

describe("authenticateCronRequest", () => {
  it("fails closed with a server configuration error when no current secret is configured", async () => {
    delete process.env.LOVABLE_CRON_SECRET;
    delete process.env.LOVABLE_CRON_SECRET_PREVIOUS;
    const response = await authenticateCronRequest(request("Bearer any-token"));
    expect(response?.status).toBe(500);
  });

  it("rejects missing, malformed, and incorrect bearer credentials", async () => {
    process.env.LOVABLE_CRON_SECRET = "current-secret";
    delete process.env.LOVABLE_CRON_SECRET_PREVIOUS;

    for (const authorization of [undefined, "", "current-secret", "bearer current-secret", "Bearer ", "Bearer wrong,other"]) {
      const response = await authenticateCronRequest(request(authorization));
      expect(response?.status).toBe(401);
    }
  });

  it("accepts the current secret and returns null for an authorized request", async () => {
    process.env.LOVABLE_CRON_SECRET = "current-secret";
    process.env.LOVABLE_CRON_SECRET_PREVIOUS = "previous-secret";

    expect(await authenticateCronRequest(request("Bearer current-secret"))).toBeNull();
  });

  it("accepts the previous secret during a controlled rotation window", async () => {
    process.env.LOVABLE_CRON_SECRET = "current-secret";
    process.env.LOVABLE_CRON_SECRET_PREVIOUS = "previous-secret";

    expect(await authenticateCronRequest(request("Bearer previous-secret"))).toBeNull();
  });

  it("does not accept the previous secret when it does not match the configured rotation secret", async () => {
    process.env.LOVABLE_CRON_SECRET = "current-secret";
    process.env.LOVABLE_CRON_SECRET_PREVIOUS = "other-previous-secret";

    const response = await authenticateCronRequest(request("Bearer previous-secret"));
    expect(response?.status).toBe(401);
  });
});
