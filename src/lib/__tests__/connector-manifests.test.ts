// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { CONNECTOR_MANIFESTS, getConnectorActionForNode, getConnectorCapabilityLabel, getConnectorManifestForNode, validateConnectorActionConfig } from "../connector-manifests";

describe("connector manifests", () => {
  it("limits the registry to implemented execution paths", () => {
    expect(CONNECTOR_MANIFESTS.map((item) => item.id)).toEqual(["google_mail", "chat_webhooks", "http_request"]);
  });
  it("requires a user test-send for Gmail", () => {
    expect(getConnectorManifestForNode("action.gmail", "Gmail")?.verification).toBe("user-initiated-test-send");
  });
  it("does not call webhook configuration provider verification", () => {
    expect(getConnectorManifestForNode("app.slack.create.message", "Slack")?.verification).toBe("configuration-preflight-only");
    expect(getConnectorActionForNode("app.slack.create.message", "Slack")?.action.id).toBe("chat.post_message");
  });
  it("keeps generic HTTP behind the runtime gate", () => {
    expect(getConnectorManifestForNode("action.http", "HTTP")?.runtime).toBe("deployment-gated");
  });
  it("does not invent a manifest for catalog-only nodes", () => {
    expect(getConnectorManifestForNode("app.hubspot.create.contact", "HubSpot")).toBeUndefined();
  });

  it("labels capability according to both verification and runtime gates", () => {
    expect(getConnectorCapabilityLabel("action.gmail", "Gmail")).toBe("Test email required");
    expect(getConnectorCapabilityLabel("app.slack.create.message", "Slack")).toBe("Runtime gated · delivery unverified");
    expect(getConnectorCapabilityLabel("action.http", "HTTP")).toBe("Runtime gated");
    expect(getConnectorCapabilityLabel("app.hubspot.create.contact", "HubSpot")).toBe("Catalog only");
    expect(getConnectorCapabilityLabel("trigger.schedule", "Core")).toBeNull();
  });

  it("rejects malformed generated message node IDs rather than matching a prefix/suffix only", () => {
    expect(getConnectorManifestForNode("app.slack.extra.create.message", "Slack")).toBeUndefined();
    expect(getConnectorActionForNode("app.slack.extra.create.message", "Slack")).toBeUndefined();
    expect(getConnectorManifestForNode("app.slack.create.message", "Slack")?.id).toBe("chat_webhooks");
  });

  it("defines unique, bounded action contracts with truthful outputs", () => {
    const actionIds = CONNECTOR_MANIFESTS.flatMap((manifest) => manifest.actions.map((action) => action.id));
    expect(new Set(actionIds).size).toBe(actionIds.length);
    for (const manifest of CONNECTOR_MANIFESTS) {
      expect(manifest.actions.length).toBeGreaterThan(0);
      for (const action of manifest.actions) {
        expect(action.nodeIds.length).toBeGreaterThan(0);
        expect(action.timeoutSeconds).toBeGreaterThan(0);
        expect(action.timeoutSeconds).toBeLessThanOrEqual(60);
        expect(action.output.fields.length).toBeGreaterThan(0);
        expect(action.output.description.length).toBeGreaterThan(0);
        expect(action.nodeIds.every((id) => manifest.nodeIds.includes(id))).toBe(true);
      }
    }
  });

  it("validates required settings without inventing support for catalog-only actions", () => {
    expect(getConnectorActionForNode("action.gmail")?.action.id).toBe("gmail.send_email");
    expect(validateConnectorActionConfig("action.gmail", { to: "user@example.com" })).toBeNull();
    expect(validateConnectorActionConfig("action.gmail", { to: "  " })).toContain("to");
    expect(validateConnectorActionConfig("action.slack", {})).toContain("webhook");
    expect(validateConnectorActionConfig("action.crm", { object: "Contact" })).toContain("No reviewed connector");
  });

  it("rejects non-string config values at the connector boundary", () => {
    expect(validateConnectorActionConfig("action.http", { url: "https://example.com", timeout: 30 })).toContain("must be text");
  });

  it("rejects unknown connector settings instead of silently ignoring typos", () => {
    expect(validateConnectorActionConfig("action.gmail", { to: "user@example.com", subejct: "typo" })).toContain("not supported");
    expect(validateConnectorActionConfig("action.http", { url: "https://example.com", headers: "x-api-key: secret" })).toContain("not supported");
  });

  it("validates HTTP methods and timeout bounds before live execution", () => {
    expect(validateConnectorActionConfig("action.http", { url: "https://example.com", method: "TRACE" })).toContain("HTTP method");
    expect(validateConnectorActionConfig("action.http", { url: "https://example.com", timeout: "0" })).toContain("timeout");
    expect(validateConnectorActionConfig("action.http", { url: "https://example.com", timeout: "31" })).toContain("timeout");
    expect(validateConnectorActionConfig("action.http", { url: "https://example.com", method: "POST", timeout: "10" })).toBeNull();
  });

  it("preserves the documented legacy chat message fallback field", () => {
    expect(validateConnectorActionConfig("app.slack.create.message", { webhook: "https://hooks.slack.com/services/example", fields: "hello" }, "Slack")).toBeNull();
  });
});
