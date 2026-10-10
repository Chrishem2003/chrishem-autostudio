import { callAsAppUser, appUserReconnectRequired } from "@/integrations/lovable/appUserConnector";
import { getConnectionForUser } from "@/lib/app-user-connections.server";
import { buildChatRequest, isChatMessageStep } from "@/lib/chat-steps";
import { buildGmailMessage, isGmailSendStep, toRawEmail } from "@/lib/gmail-steps";
import { callWeb, type WebInput } from "@/lib/web-steps.server";
import { NODES } from "@/lib/automation-catalog";
import type { WorkflowNode } from "@/lib/workflow";

const GMAIL_GATEWAY = "https://connector-gateway.lovable.dev";
const GMAIL_CONNECTOR = "google_mail";
const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.send",
];

export type ExecutionMode = "dry" | "test" | "live";
export type ExecutedStep = {
  nodeId: string;
  label: string;
  status: "success" | "failed" | "dry_run";
  ms: number;
  detail: string;
};

export function liveCapabilityError(node: WorkflowNode): string | null {
  const tool = NODES[node.defId]?.tool;
  if (node.defId === "trigger.schedule") return null;
  if (NODES[node.defId]?.kind === "trigger") return `Trigger "${node.name}" has no live trigger adapter yet.`;
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
  const result = (status: ExecutedStep["status"], detail: string, ms = Date.now() - started): ExecutedStep => ({
    nodeId: node.id,
    label: node.name.slice(0, 160),
    status,
    ms: Math.max(0, Math.round(ms)),
    detail: safeDetail(detail),
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
  if (definition?.kind === "trigger") return result("failed", `Trigger "${node.name}" has no live trigger adapter yet.`, 0);

  const unsupported = liveCapabilityError(node);
  if (unsupported) return result("failed", unsupported, 0);

  if (isGmailSendStep(node.defId)) {
    const message = buildGmailMessage(node.config, flowName);
    if (!message) return result("failed", "Add a valid recipient before sending email.", 0);
    if ("error" in message) return result("failed", message.error, 0);

    const connection = await getConnectionForUser(userId, GMAIL_CONNECTOR);
    if (!connection) return result("failed", "Gmail isn't connected. Reconnect Gmail before running this flow.", 0);

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
      },
    });
    if (await appUserReconnectRequired(response)) {
      return result("failed", "Gmail access needs renewing. Reconnect Gmail before retrying.");
    }
    if (!response.ok) {
      // Do not log the provider body: it can contain account data or diagnostics.
      return result("failed", `Gmail refused the email (${response.status}). Check the recipient and Gmail permissions.`);
    }
    return result("success", `Email sent from ${connection.email ?? "your Gmail"} to ${message.to.length} recipient(s).`);
  }

  const tool = definition?.tool;
  if (isChatMessageStep(node.defId, tool)) {
    const chat = buildChatRequest(tool!, node.config, flowName);
    if (!chat) return result("failed", "Chat webhook is not configured; no message was sent.", 0);
    if ("error" in chat) return result("failed", chat.error, 0);
    const response = await callWeb({ method: "POST", url: chat.url, body: chat.body, timeoutSec: 30 });
    return result(response.ok ? "success" : "failed", response.ok ? `Message delivered to ${tool}.` : response.detail, response.ms);
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
      timeoutSec: Math.min(120, Math.max(1, Number(node.config["timeout"]) || 30)),
    };
    const response = await callWeb(input);
    return result(response.ok ? "success" : "failed", response.detail, response.ms);
  }

  return result("failed", `"${node.name}" does not have a live executor. No external action was taken.`, 0);
}
