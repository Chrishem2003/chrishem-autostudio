import { afterEach, describe, expect, test } from "bun:test";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

const originalCurrent = process.env["LOVABLE_CRON_SECRET"];
const originalPrevious = process.env["LOVABLE_CRON_SECRET_PREVIOUS"];

afterEach(() => {
  if (originalCurrent === undefined) delete process.env["LOVABLE_CRON_SECRET"];
  else process.env["LOVABLE_CRON_SECRET"] = originalCurrent;
  if (originalPrevious === undefined) delete process.env["LOVABLE_CRON_SECRET_PREVIOUS"];
  else process.env["LOVABLE_CRON_SECRET_PREVIOUS"] = originalPrevious;
});

function request(authorization?: string): Request {
  return new Request("https://autostudio.test/api/public/cron/run-execution-job", {
    method: "POST",
    headers: authorization === undefined ? {} : { authorization },
  });
}

describe("authenticateCronRequest", () => {
  test("fails closed when the current cron secret is not configured", async () => {
    delete process.env["LOVABLE_CRON_SECRET"];
    delete process.env["LOVABLE_CRON_SECRET_PREVIOUS"];

    const response = await authenticateCronRequest(request("Bearer any-token"));
    expect(response?.status).toBe(500);
    expect(await response?.text()).toBe("Server configuration error");
  });

  test("rejects missing authorization and malformed bearer headers", async () => {
    process.env["LOVABLE_CRON_SECRET"] = "current-secret";
    delete process.env["LOVABLE_CRON_SECRET_PREVIOUS"];

    for (const header of [
      undefined,
      "",
      "current-secret",
      "bearer current-secret",
      "Bearer",
      "Bearer current-secret extra",
      "Bearer current-secret,other",
      "Bearer current-secret ",
    ]) {
      const response = await authenticateCronRequest(request(header));
      expect(response?.status).toBe(401);
      expect(await response?.text()).toBe("Unauthorized");
    }
  });

  test("accepts only an exact current bearer token", async () => {
    process.env["LOVABLE_CRON_SECRET"] = "current-secret";
    delete process.env["LOVABLE_CRON_SECRET_PREVIOUS"];

    expect(await authenticateCronRequest(request("Bearer current-secret"))).toBeNull();
    expect((await authenticateCronRequest(request("Bearer wrong-secret")))?.status).toBe(401);
  });

  test("accepts the configured previous secret during rotation", async () => {
    process.env["LOVABLE_CRON_SECRET"] = "current-secret";
    process.env["LOVABLE_CRON_SECRET_PREVIOUS"] = "previous-secret";

    expect(await authenticateCronRequest(request("Bearer current-secret"))).toBeNull();
    expect(await authenticateCronRequest(request("Bearer previous-secret"))).toBeNull();
    expect((await authenticateCronRequest(request("Bearer unrelated-secret")))?.status).toBe(401);
  });

  test("does not accept a previous secret when it is unset", async () => {
    process.env["LOVABLE_CRON_SECRET"] = "current-secret";
    delete process.env["LOVABLE_CRON_SECRET_PREVIOUS"];

    expect((await authenticateCronRequest(request("Bearer previous-secret")))?.status).toBe(401);
  });
});
