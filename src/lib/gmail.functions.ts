import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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
    const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const returnUrl = new URL("/oauth/gmail/return", sandboxHost ? `https://${sandboxHost}` : url.origin).toString();
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
    await saveConnectionKeyForUser(context.userId, CONNECTOR, connectionAPIKey, email);
    return { ok: true, email };
  });

export const getGmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionForUser } = await import("./app-user-connections.server");
    const conn = await getConnectionForUser(context.userId, CONNECTOR);
    return { connected: !!conn, email: conn?.email ?? null };
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

export const sendGmailStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ config: z.record(z.string(), z.string()), flowName: z.string().max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
    const { getConnectionForUser } = await import("./app-user-connections.server");
    const msg = buildGmailMessage(data.config, data.flowName);
    if (!msg) return { ok: false, detail: "Add who to send to in “To”." };
    if ("error" in msg) return { ok: false, detail: msg.error };
    const conn = await getConnectionForUser(context.userId, CONNECTOR);
    if (!conn) return { ok: false, detail: "Connect your Gmail first (Accounts tab → Connect Gmail)." };
    const started = Date.now();
    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY,
      connectionAPIKey: conn.key,
      connectorId: CONNECTOR,
      path: "/gmail/v1/users/me/messages/send",
      requiredScopes: SCOPES,
      init: { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ raw: toRawEmail(msg) }) },
    });
    const ms = Date.now() - started;
    if (await appUserReconnectRequired(res)) return { ok: false, ms, detail: "Your Gmail access needs renewing — press Reconnect Gmail in the Accounts tab." };
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      console.error(`Gmail send failed [${res.status}]: ${text}`);
      return { ok: false, ms, detail: `Gmail refused the email (${res.status}). ${text}` };
    }
    return { ok: true, ms, detail: `Email sent from ${conn.email ?? "your Gmail"} to ${msg.to.join(", ")}.` };
  });
