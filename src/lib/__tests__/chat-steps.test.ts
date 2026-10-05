// @ts-nocheck -- vitest types are resolved at test time
import { describe, it, expect } from "vitest";
import { buildChatRequest, isChatMessageStep } from "../chat-steps";

describe("chat message steps", () => {
  it("Slack create-message is a live chat step", () => expect(isChatMessageStep("app.slack.create.message", "Slack")).toBe(true));
  it("Slack list-channel is not", () => expect(isChatMessageStep("app.slack.list.channel", "Slack")).toBe(false));
  it("Slack sends {text}", () => {
    const r = buildChatRequest("Slack", { webhook: "https://hooks.slack.com/services/A/B/C", message: "hi" }, "F");
    expect(r).toEqual({ url: "https://hooks.slack.com/services/A/B/C", body: '{"text":"hi"}' });
  });
  it("Discord sends {content}", () => {
    const r = buildChatRequest("Discord", { webhook: "https://discord.com/api/webhooks/1/x", message: "hi" }, "F");
    expect(r && "body" in r && r.body).toBe('{"content":"hi"}');
  });
  it("rejects a non-Slack link on a Slack step", () =>
    expect(buildChatRequest("Slack", { webhook: "https://evil.example.com/x" }, "F")).toHaveProperty("error"));
  it("no link means practice step", () => expect(buildChatRequest("Slack", {}, "F")).toBeNull());
});
