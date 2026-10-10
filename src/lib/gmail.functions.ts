import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev";
const CONNECTOR = "google_mail";
const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.send",
];

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

async function lookupEmail(key: string): Promise<string | null> {
  const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
  const res = await callAsAppUser({ gatewayBaseUrl: GATEWAY, connectionAPIKey: key, connectorId: CONNECTOR, path: "/gmail/v1/users/me/profile", requiredScopes: SCOPES });
  if (!res.ok) return null;
  const j = (await res.json()) as { emailAddress?: string };
  return j.emailAddress ?? null;
}

export const completeGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(1).max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { exchangeAppUserOAuthCode } = await import("@/integrations/lovable/appUserConnector");
    const { saveConnectionKeyForUser } = await import("./app-user-connections.server");
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(GATEWAY, data.code);
    if (connectorId !== CONNECTOR) throw new Error("Connection returned for the wrong app.");
    const email = await lookupEmail(connectionAPIKey).catch(() => null);
    if (!email) {
      const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
      await disconnectAppUser({ gatewayBaseUrl: GATEWAY, connectionAPIKey, connectorId: CONNECTOR }).catch(() => {});
      throw new Error("Gmail authorization was received, but the read-only profile verification failed. The connection was not saved.");
    }
    await saveConnectionKeyForUser(context.userId, CONNECTOR, connectionAPIKey, email);
    return { ok: true, email };
  });

export const getGmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionForUser } = await import("./app-user-connections.server");
    const conn = await getConnectionForUser(context.userId, CONNECTOR);
    if (!conn) return { connected: false, email: null };
    const verifiedEmail = await lookupEmail(conn.key).catch(() => null);
    if (!verifiedEmail) return { connected: false, email: conn.email ?? null };
    if (verifiedEmail !== conn.email) {
      const { setAccountEmail } = await import("./app-user-connections.server");
      await setAccountEmail(context.userId, CONNECTOR, verifiedEmail);
    }
    return { connected: true, email: verifiedEmail };
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
