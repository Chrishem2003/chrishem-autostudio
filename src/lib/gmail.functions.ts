import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { toRawEmail } from "./gmail-steps";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev";
const CONNECTOR = "google_mail";
const SCOPES = ["https://www.googleapis.com/auth/gmail.send"];

export const startGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientKey = process.env["GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY"];
    if (!clientKey) throw new Error("Gmail isn't set up for this app yet.");
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    const { getConnectionForUser } = await import("./app-user-connections.server");
    const request = getRequest();
    const url = new URL(request.url);
    const returnUrl = new URL("/oauth/gmail/return", url.origin).toString();
    const existing = await getConnectionForUser(context.userId, CONNECTOR);
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY,
      connectorId: CONNECTOR,
      appUserId: context.userId,
      clientAPIKey: clientKey,
      returnUrl,
      connectionAPIKey: existing?.key,
      credentialsConfiguration: { scopes: SCOPES },
    });
    return { authorizationUrl };
  });

export const completeGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(1).max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { exchangeAppUserOAuthCode } = await import("@/integrations/lovable/appUserConnector");
    const { saveConnectionKeyForUser } = await import("./app-user-connections.server");
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(GATEWAY, data.code);
    if (connectorId !== CONNECTOR) throw new Error("Connection returned for the wrong app.");
    // gmail.send deliberately cannot call users.getProfile. Store it as pending until
    // the user explicitly sends a test email to a recipient they choose.
    await saveConnectionKeyForUser(context.userId, CONNECTOR, connectionAPIKey, null);
    return { ok: true, verified: false };
  });

export const getGmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionForUser } = await import("./app-user-connections.server");
    const conn = await getConnectionForUser(context.userId, CONNECTOR);
    if (!conn) return { connected: false, pendingVerification: false, email: null };
    const verifiedAt = conn.verifiedAt ? Date.parse(conn.verifiedAt) : 0;
    const verified = verifiedAt > 0 && Date.now() - verifiedAt < 30 * 24 * 60 * 60 * 1000;
    return {
      connected: verified,
      pendingVerification: !verified,
      email: conn.email ?? null,
    };
  });

export const disconnectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
    const { getConnectionForUser, deleteConnectionForUser } = await import("./app-user-connections.server");
    const conn = await getConnectionForUser(context.userId, CONNECTOR);
    if (conn) {
      await disconnectAppUser({ gatewayBaseUrl: GATEWAY, connectionAPIKey: conn.key, connectorId: CONNECTOR }).catch(() => {});
      await deleteConnectionForUser(context.userId, CONNECTOR);
    }
    return { ok: true };
  });

/**
 * Sends a real, clearly identified test email to the recipient the user entered.
 * This is the verification action for the least-privilege gmail.send scope.
 */
export const sendGmailTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    recipient: z.string().trim().email().max(254),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
    const { getConnectionForUser, markConnectionVerified, markConnectionUnverified } = await import("./app-user-connections.server");
    const connection = await getConnectionForUser(context.userId, CONNECTOR);
    if (!connection) return { ok: false as const, detail: "Connect Gmail first." };

    const raw = toRawEmail({
      to: [data.recipient],
      subject: "Chrishem AutoStudio — Gmail connection test",
      body: "This is a test email requested from Chrishem AutoStudio to verify your send-only Gmail connection. No automation was run.",
    });
    try {
      const response = await callAsAppUser({
        gatewayBaseUrl: GATEWAY,
        connectionAPIKey: connection.key,
        connectorId: CONNECTOR,
        path: "/gmail/v1/users/me/messages/send",
        requiredScopes: SCOPES,
        init: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ raw }),
          signal: AbortSignal.timeout(30_000),
        },
      });
      if (await appUserReconnectRequired(response) || response.status === 401 || response.status === 403) {
        await response.arrayBuffer().catch(() => undefined);
        await markConnectionUnverified(context.userId, CONNECTOR);
        return { ok: false as const, detail: "Gmail authorization needs renewing. Reconnect Gmail and send a new test email." };
      }
      if (!response.ok) {
        await response.arrayBuffer().catch(() => undefined);
        return { ok: false as const, detail: `Gmail test email failed (HTTP ${response.status}). Check the address and try again.` };
      }
      await response.arrayBuffer().catch(() => undefined);
      await markConnectionVerified(context.userId, CONNECTOR);
      return { ok: true as const, detail: `Test email sent to ${data.recipient}. Gmail is verified for live sends.` };
    } catch {
      return { ok: false as const, detail: "Gmail test email could not be completed. Check your connection and try again." };
    }
  });

/**
 * Direct client-requested sends are disabled. Live sends must pass through
 * executeAutomationStep, which verifies saved-flow ownership and live status.
 */
export const sendGmailStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    config: z.record(z.string(), z.string()),
    flowName: z.string().max(200),
  }).parse(input))
  .handler(async () => ({
    ok: false as const,
    ms: 0,
    detail: "Direct Gmail sends are disabled. Save the flow, preview it, and enable live execution to send through the guarded executor.",
  }));
