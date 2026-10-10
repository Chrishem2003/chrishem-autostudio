import { callAsAppUser, appUserReconnectRequired } from "@/integrations/lovable/appUserConnector";
import { getConnectionForUser } from "@/lib/app-user-connections.server";
import { buildChatRequest, isChatMessageStep } from "@/lib/chat-steps";
import { buildGmailMessage, isGmailSendStep, toRawEmail } from "@/lib/gmail-steps";
import { callWeb, isBlockedHost, resolvePublicTarget, type WebInput } from "@/lib/web-steps.server";
import { NODES } from "@/lib/automation-catalog";
import { getConnectorManifestForNode, validateConnectorActionConfig } from "@/lib/connector-manifests";
import type { WorkflowNode } from "@/lib/workflow";

const GMAIL_GATEWAY = "https://connector-gateway.lovable.dev";
const GMAIL_CONNECTOR = "google_mail";
const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.send"];
const GMAIL_VERIFICATION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const outboundTransportReady = () => process.env["AUTOSTUDIO_OUTBOUND_TRANSPORT_READY"] === "true";

export type ExecutionMode = "dry" | "test" | "live";
export type ExecutedStep = {
  nodeId: string;
  label: string;
  status: "success" | "failed" | "dry_run";
  ms: number;
  detail: string;
  outputs?: Readonly<Record<string, string | number | boolean>>;
};

export function liveCapabilityError(node: WorkflowNode): string | null {
  const tool = NODES[node.defId]?.tool;
  if (node.defId === "trigger.schedule" || node.defId === "trigger.manual") return null;
  if (NODES[node.defId]?.kind === "trigger") return `Trigger "${node.name}" has no live trigger adapter yet.`;
  const mappingKeys = node.defId === "action.gmail"
    ? new Set(["subject", "body"])
    : node.defId === "action.http"
      ? new Set(["body"])
      : (node.defId === "action.slack" || (node.defId.startsWith("app.") && node.defId.endsWith(".create.message")))
        ? new Set(["message"])
        : new Set<string>();
  for (const [key, value] of Object.entries(node.config)) {
    if (typeof value !== "string" || (!value.includes("{{") && !value.includes("}}"))) continue;
    if (!mappingKeys.has(key)) {
      return `Dynamic data mapping is not allowed for "${key}" on this step; no external action will be taken.`;
    }
    const stripped = value.replace(/\{\{steps\.[A-Za-z0-9_-]+\.[A-Za-z][A-Za-z0-9_]*\}\}/g, "");
    if (stripped.includes("{{") || stripped.includes("}}")) {
      return `Config field "${key}" contains an invalid or unsupported data token; no external action will be taken.`;
    }
  }
  const manifest = getConnectorManifestForNode(node.defId, tool);
  if (!manifest) {
    return `"${node.name}" has no verified live executor or reviewed connector manifest. It must remain Test only until both are implemented.`;
  }
  const contractError = validateConnectorActionConfig(node.defId, node.config, tool);
  if (contractError) return `"${node.name}": ${contractError}`;
  if (isGmailSendStep(node.defId)) {
    return node.config["to"]?.trim()
      ? null
      : "Add a recipient before enabling this flow for live execution.";
  }
  if (isChatMessageStep(node.defId, tool)) {
    const chat = buildChatRequest(tool!, node.config, "AutoStudio");
    if (!chat) return "Add and verify the chat webhook before enabling this flow.";
    return "error" in chat ? chat.error : null;
  }
  if (node.defId === "action.http" || node.defId === "output.webhook") {
    const url = node.config["url"]?.trim();
    if (!url) return "Add a destination URL before enabling this flow.";
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "Only HTTP and HTTPS destinations can run live.";
      if (parsed.username || parsed.password) return "Remove embedded usernames or passwords from the destination URL.";
    } catch {
      return "Enter a valid destination URL before enabling this flow.";
    }
    return null;
  }
  return `"${node.name}" has no verified live executor yet. It must remain Test only until its connector is implemented.`;
}

function safeDetail(value: string): string {
  return value
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]")
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|client[_-]?secret|authorization)\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]")
    .slice(0, 500);
}

export async function executeStep(args: {
  node: WorkflowNode;
  flowName: string;
  userId: string;
  mode: ExecutionMode;
}): Promise<ExecutedStep> {
  const { node, flowName, userId, mode } = args;
  const started = Date.now();
  const result = (status: ExecutedStep["status"], detail: string, ms = Date.now() - started, outputs?: Readonly<Record<string, string | number | boolean>>): ExecutedStep => ({
    nodeId: node.id,
    label: node.name.slice(0, 160),
    status,
    ms: Math.max(0, Math.round(ms)),
    detail: safeDetail(detail),
    ...(outputs ? { outputs } : {}),
  });

  if (mode !== "live") {
    return result(
      "dry_run",
      mode === "test"
        ? "Test mode is fail-closed: no test target is configured, so no external request was made."
        : "Dry run only: no external request was made.",
      0,
    );
  }

  const definition = NODES[node.defId];
  if (node.defId === "trigger.schedule") return result("success", "Scheduled trigger accepted; execution started.", 0);
  if (node.defId === "trigger.manual") return result("success", "Manual trigger accepted; execution started.", 0);
  if (definition?.kind === "trigger") return result("failed", `Trigger "${node.name}" has no live trigger adapter yet.`, 0);

  if (Object.values(node.config).some((value) => typeof value === "string" && (value.includes("{{") || value.includes("}}")))) {
    return result("failed", "Unresolved data tokens reached the executor. No external action was taken.", 0);
  }

  const unsupported = liveCapabilityError(node);
  if (unsupported) return result("failed", unsupported, 0);

  const liveTool = NODES[node.defId]?.tool;
  if (
    (node.defId === "action.http" || node.defId === "output.webhook" || isChatMessageStep(node.defId, liveTool)) &&
    !outboundTransportReady()
  ) {
    return result("failed", "Outbound HTTP transport has not passed the deployment runtime smoke test. No request was sent.", 0);
  }

  if (isGmailSendStep(node.defId)) {
    const message = buildGmailMessage(node.config, flowName);
    if (!message) return result("failed", "Add a valid recipient before sending email.", 0);
    if ("error" in message) return result("failed", message.error, 0);

    const connection = await getConnectionForUser(userId, GMAIL_CONNECTOR);
    if (!connection) return result("failed", "Gmail is not connected. Connect Gmail before running this flow.", 0);
    const verifiedAt = connection.verifiedAt ? Date.parse(connection.verifiedAt) : 0;
    if (!verifiedAt || Date.now() - verifiedAt >= GMAIL_VERIFICATION_MAX_AGE_MS) {
      return result("failed", "Gmail needs a fresh test email before live execution. Open Accounts and verify Gmail.", 0);
    }

    const response = await callAsAppUser({
      gatewayBaseUrl: GMAIL_GATEWAY,
      connectionAPIKey: connection.key,
      connectorId: GMAIL_CONNECTOR,
      path: "/gmail/v1/users/me/messages/send",
      requiredScopes: GMAIL_SCOPES,
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ raw: toRawEmail(message) }),
        signal: AbortSignal.timeout(30_000),
      },
    });
    if (await appUserReconnectRequired(response) || response.status === 401 || response.status === 403) {
      await response.arrayBuffer().catch(() => undefined);
      const { markConnectionUnverified } = await import("@/lib/app-user-connections.server");
      await markConnectionUnverified(userId, GMAIL_CONNECTOR);
      return result("failed", "Gmail access needs renewing. Reconnect Gmail and verify it again.");
    }
    if (!response.ok) {
      await response.arrayBuffer().catch(() => undefined);
      return result("failed", `Gmail refused the email (HTTP ${response.status}). Check the recipient and Gmail permissions.`);
    }
    const providerPayload: unknown = await response.json().catch(() => null);
    const providerMessageId = providerPayload && typeof providerPayload === "object" && "id" in providerPayload && typeof providerPayload.id === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(providerPayload.id)
      ? providerPayload.id
      : undefined;
    const { markConnectionVerified } = await import("@/lib/app-user-connections.server");
    await markConnectionVerified(userId, GMAIL_CONNECTOR);
    return result("success", "Email accepted by your verified Gmail connection. Provider acceptance does not guarantee recipient delivery.", undefined, {
      accepted: true,
      ...(providerMessageId ? { providerMessageId } : {}),
    });
  }

  const tool = definition?.tool;
  if (isChatMessageStep(node.defId, tool)) {
    const chat = buildChatRequest(tool!, node.config, flowName);
    if (!chat) return result("failed", "Chat webhook is not configured; no message was sent.", 0);
    if ("error" in chat) return result("failed", chat.error, 0);
    const response = await callWeb({ method: "POST", url: chat.url, body: chat.body, timeoutSec: 30 });
    return result(
      response.ok ? "success" : "failed",
      response.ok ? `Webhook accepted the message for ${tool}.` : `Webhook delivery failed (HTTP ${response.status || "network error"}). Check the provider URL and permissions.`,
      response.ms,
      { httpStatus: response.status },
    );
  }

  if (node.defId === "action.http" || node.defId === "output.webhook") {
    const methodValue = node.defId === "output.webhook" ? "POST" : node.config["method"] || "GET";
    const allowedMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
    if (!allowedMethods.includes(methodValue as (typeof allowedMethods)[number])) {
      return result("failed", "Unsupported HTTP method.", 0);
    }
    const input: WebInput = {
      method: methodValue as WebInput["method"],
      url: node.config["url"]!.trim(),
      body: node.config["body"] || (node.defId === "output.webhook" ? JSON.stringify({ flow: flowName, sentAt: new Date().toISOString() }) : undefined),
      timeoutSec: Math.min(30, Math.max(1, Number(node.config["timeout"]) || 30)),
    };
    const response = await callWeb(input);
    return result(
      response.ok ? "success" : "failed",
      response.ok
        ? `HTTP ${response.status} response from ${new URL(input.url).hostname}.`
        : `HTTP request failed (status ${response.status || "network error"}). Check the destination and request settings.`,
      response.ms,
      { httpStatus: response.status },
    );
  }

  return result("failed", `"${node.name}" does not have a live executor. No external action was taken.`, 0);
}


/**
 * Preflight checks for enabling a saved flow. Gmail is verified with a harmless
 * read-only profile request; HTTP/webhook destinations are DNS-checked so a
 * private target cannot be enabled and later reached through a DNS rebinding.
 */
export async function livePreflightError(node: WorkflowNode, userId: string): Promise<string | null> {
  const capabilityError = liveCapabilityError(node);
  if (capabilityError) return capabilityError;

  const definition = NODES[node.defId];
  if (isGmailSendStep(node.defId)) {
    const connection = await getConnectionForUser(userId, GMAIL_CONNECTOR);
    if (!connection) return "Connect Gmail before enabling this flow.";
    const verifiedAt = connection.verifiedAt ? Date.parse(connection.verifiedAt) : 0;
    if (!verifiedAt || Date.now() - verifiedAt >= GMAIL_VERIFICATION_MAX_AGE_MS) {
      return "Send a test email from Accounts to verify Gmail send-only permission before enabling this flow.";
    }
    return null;
  }

  const tool = definition?.tool;
  const chat = isChatMessageStep(node.defId, tool) ? buildChatRequest(tool!, node.config, "AutoStudio") : null;
  const rawUrl = chat && !("error" in chat) ? chat.url : node.config["url"];
  if (rawUrl) {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return "The destination URL is invalid.";
    }
    if (isBlockedHost(url.hostname)) {
      return "The destination is private or local and cannot be used by a live flow.";
    }
    if (!outboundTransportReady()) {
      return "Outbound HTTP transport has not passed the deployment runtime smoke test. Keep this flow in Preview until an operator enables the verified transport.";
    }
    try {
      await resolvePublicTarget(url.hostname);
    } catch {
      return "The destination could not pass the public-address safety check. Check its URL and DNS configuration.";
    }
  }
  return null;
}
