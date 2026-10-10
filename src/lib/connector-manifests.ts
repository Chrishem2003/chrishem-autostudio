/**
 * Reviewed connector capability registry.
 *
 * This registry describes implemented execution paths, not the full marketing
 * catalog. "Configured" is deliberately not synonymous with "verified".
 * Keep this list aligned with execute-step.server.ts and connector contract tests.
 */
export type ConnectorVerification =
  | "user-initiated-test-send"
  | "configuration-preflight-only"
  | "deployment-smoke-test-required";

export type ConnectorRuntime = "available-after-preflight" | "deployment-gated";

export interface ConnectorManifest {
  id: string;
  name: string;
  category: "email" | "chat" | "http";
  authModel: "oauth" | "secret-webhook-url" | "user-configured-request";
  nodeIds: readonly string[];
  /** Dynamic generated app steps can be resolved by tool name and suffix. */
  generatedMessageToolNames?: readonly string[];
  verification: ConnectorVerification;
  runtime: ConnectorRuntime;
  requiredChecks: readonly string[];
  retryPolicy: "never-without-idempotency" | "safe-methods-only" | "provider-contract";
  truthLabel: string;
  notes: string;
}

export const CONNECTOR_MANIFESTS: readonly ConnectorManifest[] = [
  {
    id: "google_mail",
    name: "Gmail",
    category: "email",
    authModel: "oauth",
    nodeIds: ["action.gmail"],
    verification: "user-initiated-test-send",
    runtime: "available-after-preflight",
    requiredChecks: [
      "A server-stored user connection exists",
      "A user-requested test email succeeded",
      "The verification is younger than 30 days",
      "The Gmail send scope is present",
    ],
    retryPolicy: "provider-contract",
    truthLabel: "Verified by test email",
    notes: "Send-only OAuth scope. A successful OAuth handshake alone is not verification.",
  },
  {
    id: "chat_webhooks",
    name: "Chat incoming webhooks",
    category: "chat",
    authModel: "secret-webhook-url",
    nodeIds: ["action.slack"],
    generatedMessageToolNames: ["Slack", "Discord", "Microsoft Teams", "Mattermost"],
    verification: "configuration-preflight-only",
    runtime: "deployment-gated",
    requiredChecks: [
      "The configured HTTPS URL matches the provider's host rules",
      "DNS resolution rejects private and special-use addresses",
      "The deployed outbound transport smoke test has passed",
    ],
    retryPolicy: "never-without-idempotency",
    truthLabel: "Configured; delivery not pre-verified",
    notes: "A syntactically valid webhook URL is not proof the provider will accept a message. Do not label this connection Verified.",
  },
  {
    id: "http_request",
    name: "HTTP request / outgoing webhook",
    category: "http",
    authModel: "user-configured-request",
    nodeIds: ["action.http", "output.webhook"],
    verification: "deployment-smoke-test-required",
    runtime: "deployment-gated",
    requiredChecks: [
      "URL uses HTTP(S) and contains no embedded credentials",
      "Every resolved address is public and the connection is pinned to a validated address",
      "Redirects are disabled and request/response limits apply",
      "The deployed outbound transport smoke test has passed",
    ],
    retryPolicy: "safe-methods-only",
    truthLabel: "Destination configured; runtime gated",
    notes: "Generic HTTP destinations do not have a provider-account connection state. Never show them as a verified third-party integration.",
  },
] as const;

export function getConnectorManifest(id: string): ConnectorManifest | undefined {
  return CONNECTOR_MANIFESTS.find((manifest) => manifest.id === id);
}

export function getConnectorManifestForNode(
  defId: string,
  tool?: string,
): ConnectorManifest | undefined {
  return CONNECTOR_MANIFESTS.find((manifest) => {
    if (manifest.nodeIds.includes(defId)) return true;
    if (!tool || !manifest.generatedMessageToolNames?.includes(tool)) return false;
    return /^app\.[^.]+\.create\.message$/.test(defId);
  });
}
