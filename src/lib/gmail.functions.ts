import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDirectProviderExecutionDisabled } from "@/lib/direct-execution-policy";
import { buildGmailMessage, toRawEmail } from "./gmail-steps";

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
    if (url.protocol !== "https:" && url.hostname !== "localhost") {
      throw new Error("Gmail authorization requires a secure application origin.");
    }
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
  if (!res.ok) throw new Error("Google account verification failed.");
  const j = (await res.json()) as { emailAddress?: string };
  if (typeof j.emailAddress !== "string" || !j.emailAddress.includes("@")) {
    throw new Error("Google account verification returned no valid account address.");
  }
  return j.emailAddress;
}

export const completeGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(1).max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { exchangeAppUserOAuthCode } = await import("@/integrations/lovable/appUserConnector");
    const { saveConnectionKeyForUser, markConnectionVerified } = await import("./app-user-connections.server");
    const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(GATEWAY, data.code);
    if (connectorId !== CONNECTOR) {
      await disconnectAppUser({ gatewayBaseUrl: GATEWAY, connectionAPIKey, connectorId }).catch(() => {});
      throw new Error("Connection returned for the wrong app.");
    }
    try {
      const email = await lookupEmail(connectionAPIKey);
      await saveConnectionKeyForUser(context.userId, CONNECTOR, connectionAPIKey, email);
      await markConnectionVerified(context.userId, CONNECTOR);
      return { ok: true, email };
    } catch {
      await disconnectAppUser({ gatewayBaseUrl: GATEWAY, connectionAPIKey, connectorId: CONNECTOR }).catch(() => {});
      throw new Error("Gmail authorization could not be verified and saved. Please reconnect.");
    }
  });

export const getGmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionForUser, isConnectionVerificationFresh } = await import("./app-user-connections.server");
    const conn = await getConnectionForUser(context.userId, CONNECTOR);
    const connected = isConnectionVerificationFresh(conn?.verifiedAt);
    return { connected, email: connected ? conn?.email ?? null : null };
  });

export const disconnectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
    const { getConnectionForUser, deleteConnectionForUser } = await import("./app-user-connections.server");
    const conn = await getConnectionForUser(context.userId, CONNECTOR);
    if (conn) {
      await disconnectAppUser({ gatewayBaseUrl: GATEWAY, connectionAPIKey: conn.key, connectorId: CONNECTOR });
      await deleteConnectionForUser(context.userId, CONNECTOR);
    }
    return { ok: true };
  });

export const sendGmailStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ config: z.record(z.string(), z.string()), flowName: z.string().max(200) }).parse(d),
  )
  .handler(async () => {
    // Retain a clear server-side guard for any stale clients calling this legacy endpoint.
    assertDirectProviderExecutionDisabled();
  });
