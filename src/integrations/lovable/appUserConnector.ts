/** App User Connector helpers. Server-only — import only from createServerFn handlers / *.server.ts. */

function requireApiKey(): string {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("LOVABLE_API_KEY is not set. App User Connector calls require a server-side workspace token.");
  return key;
}

export interface AppUserOAuthAuthorizeParams {
  gatewayBaseUrl: string;
  connectorId: string;
  appUserId: string;
  clientAPIKey: string;
  returnUrl: string;
  connectionAPIKey?: string | undefined;
  credentialsConfiguration?: Record<string, unknown>;
}

export function validateOAuthAuthorizationUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("OAuth provider returned an invalid authorization URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "accounts.google.com" ||
    !url.pathname.startsWith("/o/oauth2/")
  ) {
    throw new Error("OAuth provider returned an untrusted authorization URL.");
  }
  return url.toString();
}

export async function authorizeAppUserOAuth(params: AppUserOAuthAuthorizeParams): Promise<{ authorizationUrl: string; sessionId: string }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${requireApiKey()}`,
    "Content-Type": "application/json",
    "X-Client-Api-Key": params.clientAPIKey,
  };
  if (params.connectionAPIKey) headers["X-Connection-Api-Key"] = params.connectionAPIKey;
  const res = await fetch(buildAppUserGatewayUrl(params.gatewayBaseUrl, "/api/v1/app-users/oauth2/authorize"), {
    method: "POST",
    headers,
    redirect: "manual",
    body: JSON.stringify({
      connector_id: params.connectorId,
      app_user_id: params.appUserId,
      return_url: params.returnUrl,
      credentials_configuration: params.credentialsConfiguration,
    }),
  });
  if (res.status >= 300 && res.status < 400) throw new Error("App User OAuth start rejected an unexpected redirect.");
  const text = await res.text();
  if (!res.ok) throw new Error(`App User OAuth start failed (${res.status}).`);
  let body: { authorization_url?: string; session_id?: string };
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("App User OAuth start returned invalid JSON.");
  }
  if (!body.authorization_url) throw new Error("App User OAuth start response missing authorization_url");
  return { authorizationUrl: validateOAuthAuthorizationUrl(body.authorization_url), sessionId: body.session_id ?? "" };
}

function validateGatewayBaseUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("App User connector gateway URL is invalid."); }
  const trustedGateway = url.protocol === "https:" && url.hostname === "connector-gateway.lovable.dev" && !url.port;
  if (!trustedGateway || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("App User connector gateway must be a trusted HTTPS origin.");
  }
  return url;
}

export function buildAppUserGatewayUrl(gatewayBaseUrl: string, endpointPath: string): string {
  const base = validateGatewayBaseUrl(gatewayBaseUrl);
  if (
    !endpointPath.startsWith("/api/v1/app-users/") ||
    endpointPath.startsWith("//") ||
    endpointPath.includes("\\") ||
    /[\u0000-\u0020\u007f#]/.test(endpointPath) ||
    /%(?:2e|2f|5c)/i.test(endpointPath)
  ) {
    throw new Error("App User gateway endpoint is invalid.");
  }
  const target = new URL(endpointPath, base);
  if (target.origin !== base.origin || !target.pathname.startsWith("/api/v1/app-users/")) {
    throw new Error("App User gateway endpoint escaped its authorized path.");
  }
  return target.toString();
}

export function buildAppUserConnectorUrl(gatewayBaseUrl: string, connectorId: string, path: string): string {
  const base = validateGatewayBaseUrl(gatewayBaseUrl);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(connectorId)) throw new Error("App User connector identifier is invalid.");
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /[\u0000-\u0020\u007f#]/.test(path) || /%(?:2e|2f|5c)/i.test(path)) {
    throw new Error("App User connector path is invalid.");
  }
  const target = new URL("/" + connectorId + path, base);
  if (target.origin !== base.origin || !target.pathname.startsWith("/" + connectorId + "/")) {
    throw new Error("App User connector path escaped its authorized endpoint.");
  }
  return target.toString();
}
export interface CallAsAppUserParams {
  gatewayBaseUrl: string;
  connectionAPIKey: string;
  connectorId: string;
  path: string;
  init?: RequestInit;
  requiredScopes?: string[];
}

export async function callAsAppUser({ gatewayBaseUrl, connectionAPIKey, connectorId, path, init, requiredScopes }: CallAsAppUserParams): Promise<Response> {
  const targetUrl = buildAppUserConnectorUrl(gatewayBaseUrl, connectorId, path);
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${requireApiKey()}`);
  headers.set("X-Connection-Api-Key", connectionAPIKey);
  if (requiredScopes?.length) headers.set("X-Lovable-Required-Scopes", requiredScopes.join(" "));
  const res = await fetch(targetUrl, { ...init, headers, redirect: "manual" });
  if (res.status >= 300 && res.status < 400) throw new Error("App User connector request rejected an unexpected redirect.");
  return res;
}

export async function appUserReconnectRequired(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  const body = (await res.clone().json().catch(() => null)) as { type?: unknown } | null;
  return typeof body?.type === "string" && body.type.startsWith("credential_");
}

export async function disconnectAppUser({ gatewayBaseUrl, connectionAPIKey, connectorId }: { gatewayBaseUrl: string; connectionAPIKey: string; connectorId: string }): Promise<void> {
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${requireApiKey()}`);
  headers.set("X-Connection-Api-Key", connectionAPIKey);
  headers.set("Content-Type", "application/json");
  const res = await fetch(buildAppUserGatewayUrl(gatewayBaseUrl, "/api/v1/app-users/connection"), {
    method: "DELETE",
    headers,
    redirect: "manual",
    body: JSON.stringify({ connector_id: connectorId }),
  });
  if (res.status >= 300 && res.status < 400) throw new Error("App User disconnect rejected an unexpected redirect.");
  if (!res.ok) throw new Error(`App User disconnect failed (${res.status}).`);
}

export async function exchangeAppUserOAuthCode(gatewayBaseUrl: string, code: string): Promise<{ connectionAPIKey: string; connectorId: string }> {
  const res = await fetch(buildAppUserGatewayUrl(gatewayBaseUrl, "/api/v1/app-users/oauth2/exchange"), {
    method: "POST",
    headers: { Authorization: `Bearer ${requireApiKey()}`, "Content-Type": "application/json" },
    redirect: "manual",
    body: JSON.stringify({ code }),
  });
  if (res.status >= 300 && res.status < 400) throw new Error("App User OAuth exchange rejected an unexpected redirect.");
  const text = await res.text();
  if (!res.ok) throw new Error(`App User OAuth exchange failed (${res.status}).`);
  let body: { api_key?: string; connector_id?: string };
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("App User OAuth exchange returned invalid JSON.");
  }
  if (!body.api_key) throw new Error("App User OAuth exchange response missing api_key");
  if (!body.connector_id) throw new Error("App User OAuth exchange response missing connector_id");
  return { connectionAPIKey: body.api_key, connectorId: body.connector_id };
}
