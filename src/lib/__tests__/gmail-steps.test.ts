// @ts-nocheck -- vitest types are resolved at test time
import { describe, it, expect } from "vitest";
import { buildGmailMessage, isGmailSendStep, parseRecipients } from "../gmail-steps";
describe("gmail send rules", () => {
  it("sends from Send Gmail and Gmail create-email steps", () => {
    expect(isGmailSendStep("action.gmail")).toBe(true);
    expect(isGmailSendStep("app.gmail.create.email")).toBe(true);
    expect(isGmailSendStep("app.gmail.list.email")).toBe(false);
  });
  it("stays a practice step with no recipient", () => expect(buildGmailMessage({}, "F")).toBeNull());
  it("rejects bad addresses", () => expect(parseRecipients("not-an-email")).toBeNull());
  it("caps at 20 recipients", () => expect(parseRecipients(Array.from({ length: 21 }, (_, i) => `a${i}@x.com`).join(","))).toBeNull());
  it("rejects unfilled placeholders", () => expect(buildGmailMessage({ to: "{{email}}" }, "F")).toHaveProperty("error"));
  it("strips newlines from subject", () => expect(buildGmailMessage({ to: "a@b.com", subject: "hi\nBcc: x@y.com" }, "F")).toMatchObject({ subject: "hi Bcc: x@y.com" }));
});
