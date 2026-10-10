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

export type ConnectorSideEffect = "external-message" | "arbitrary-http-request";
export type ConnectorIdempotency = "provider-managed" | "not-guaranteed" | "safe-methods-only";

export interface ConnectorActionContract {
  /** Stable action identifier; not a marketing/catalog label. */
  id: string;
  /** Exact workflow definition IDs accepted by this action. */
  nodeIds: readonly string[];
  /** Required string config keys checked by the shared live preflight. */
  requiredConfig: readonly string[];
  /** Optional config keys understood by the executor. */
  optionalConfig: readonly string[];
  sideEffect: ConnectorSideEffect;
  idempotency: ConnectorIdempotency;
  /** Upper bound used by the executor/transport, in seconds. */
  timeoutSeconds: number;
  output: {
    fields: readonly string[];
    description: string;
  };
}

export interface ConnectorManifest {
  id: string;
  name: string;
  category: "email" | "chat" | "http";
  authModel: "oauth" | "secret-webhook-url" | "user-configured-request";
  nodeIds: readonly string[];
  actions: readonly ConnectorActionContract[];
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
    actions: [{
      id: "gmail.send_email",
      nodeIds: ["action.gmail"],
      requiredConfig: ["to"],
      optionalConfig: ["subject", "body"],
      sideEffect: "external-message",
      idempotency: "provider-managed",
      timeoutSeconds: 30,
      output: { fields: ["accepted", "providerMessageId"], description: "Provider acceptance result and optional provider message ID; does not guarantee recipient delivery." },
    }],
    verification: "user-initiated-test-send",
    runtime: "available-after-preflight",
    requiredChecks: [
      "A server-stored user connection exists",
      "A user-requested test email succeeded",
      "The verification is younger than 30 days",
      "The Gmail send scope is present",
    ],
    retryPolicy: "provider-contract",
    truthLabel: "Test email required",
    notes: "Send-only OAuth scope. A successful OAuth handshake alone is not verification.",
  },
  {
    id: "chat_webhooks",
    name: "Chat incoming webhooks",
    category: "chat",
    authModel: "secret-webhook-url",
    nodeIds: ["action.slack"],
    actions: [{
      id: "chat.post_message",
      nodeIds: ["action.slack"],
      requiredConfig: ["webhook"],
      optionalConfig: ["channel", "message"],
      sideEffect: "external-message",
      idempotency: "not-guaranteed",
      timeoutSeconds: 30,
      output: { fields: ["httpStatus"], description: "Webhook HTTP acceptance result; provider-side delivery may differ." },
    }],
    generatedMessageToolNames: ["Slack", "Discord", "Microsoft Teams", "Mattermost"],
    verification: "configuration-preflight-only",
    runtime: "deployment-gated",
    requiredChecks: [
      "The configured HTTPS URL matches the provider's host rules",
      "DNS resolution rejects private and special-use addresses",
      "The deployed outbound transport smoke test has passed",
    ],
    retryPolicy: "never-without-idempotency",
    truthLabel: "Configured only; delivery unverified",
    notes: "A syntactically valid webhook URL is not proof the provider will accept a message. Do not label this connection Verified.",
  },
  {
    id: "http_request",
    name: "HTTP request / outgoing webhook",
    category: "http",
    authModel: "user-configured-request",
    nodeIds: ["action.http", "output.webhook"],
    actions: [{
      id: "http.request",
      nodeIds: ["action.http", "output.webhook"],
      requiredConfig: ["url"],
      optionalConfig: ["method", "body", "timeout"],
      sideEffect: "arbitrary-http-request",
      idempotency: "safe-methods-only",
      timeoutSeconds: 30,
      output: { fields: ["httpStatus"], description: "HTTP status only; response bodies and credentials are not exposed to downstream mappings." },
    }],
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

export function getConnectorActionForNode(
  defId: string,
  tool?: string,
): { manifest: ConnectorManifest; action: ConnectorActionContract } | undefined {
  const manifest = getConnectorManifestForNode(defId, tool);
  if (!manifest) return undefined;
  const isGeneratedMessage = defId.startsWith("app.") &&
    defId.endsWith(".create.message") &&
    defId.split(".").length === 4;
  const action = manifest.actions.find((candidate) => candidate.nodeIds.includes(defId))
    ?? (isGeneratedMessage && tool && manifest.generatedMessageToolNames?.includes(tool)
      ? manifest.actions.find((candidate) => candidate.id === "chat.post_message")
      : undefined);
  return action ? { manifest, action } : undefined;
}

/** Fail closed if a step is not represented by an explicit reviewed action contract. */
export function validateConnectorActionConfig(
  defId: string,
  config: Record<string, unknown>,
  tool?: string,
): string | null {
  const resolved = getConnectorActionForNode(defId, tool);
  if (!resolved) return "No reviewed connector action contract exists for this step.";
  for (const key of resolved.action.requiredConfig) {
    const value = config[key];
    if (typeof value !== "string" || !value.trim()) {
      return key === "url" ? "Destination URL is required." : `Required connector setting "${key}" is missing.`;
    }
  }
  for (const [key, value] of Object.entries(config)) {
    if (value !== undefined && typeof value !== "string") {
      return `Connector setting "${key}" must be text.`;
    }
  }
  return null;
}

export function getConnectorManifestForNode(
  defId: string,
  tool?: string,
): ConnectorManifest | undefined {
  return CONNECTOR_MANIFESTS.find((manifest) => {
    if (manifest.nodeIds.includes(defId)) return true;
    if (!tool || !manifest.generatedMessageToolNames?.includes(tool)) return false;
    return defId.startsWith("app.") &&
      defId.endsWith(".create.message") &&
      defId.split(".").length === 4;
  });
}

/** Human-readable execution capability for connector-facing UI surfaces. */
export function getConnectorCapabilityLabel(defId: string, tool?: string): string | null {
  const manifest = getConnectorManifestForNode(defId, tool);
  if (!manifest) {
    return defId.startsWith("app.") || defId.startsWith("action.") ? "Catalog only" : null;
  }
  // Runtime gates take precedence: configured credentials must never imply that
  // an external side effect is currently executable in this deployment.
  if (manifest.runtime === "deployment-gated") {
    return manifest.id === "chat_webhooks"
      ? "Runtime gated · delivery unverified"
      : "Runtime gated";
  }
  if (manifest.verification === "user-initiated-test-send") return "Test email required";
  return manifest.truthLabel;
}
