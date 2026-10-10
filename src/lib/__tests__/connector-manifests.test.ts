import { describe, expect, it } from "bun:test";
import { CONNECTOR_MANIFESTS, getConnectorManifestForNode } from "../connector-manifests";

describe("connector manifests", () => {
  it("limits the registry to implemented execution paths", () => {
    expect(CONNECTOR_MANIFESTS.map((item) => item.id)).toEqual(["google_mail", "chat_webhooks", "http_request"]);
  });
  it("requires a user test-send for Gmail", () => {
    expect(getConnectorManifestForNode("action.gmail", "Gmail")?.verification).toBe("user-initiated-test-send");
  });
  it("does not call webhook configuration provider verification", () => {
    expect(getConnectorManifestForNode("app.slack.create.message", "Slack")?.verification).toBe("configuration-preflight-only");
  });
  it("keeps generic HTTP behind the runtime gate", () => {
    expect(getConnectorManifestForNode("action.http", "HTTP")?.runtime).toBe("deployment-gated");
  });
  it("does not invent a manifest for catalog-only nodes", () => {
    expect(getConnectorManifestForNode("app.hubspot.create.contact", "HubSpot")).toBeUndefined();
  });
});
