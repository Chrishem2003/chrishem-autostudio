/** Pure rules for real Gmail sends: which steps send, and the exact message to send. */

export function isGmailSendStep(defId: string): boolean {
  return defId === "action.gmail" || defId === "app.gmail.create.email";
}

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

export function parseRecipients(to: string): string[] | null {
  const list = to.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (list.length === 0 || list.length > 20) return null;
  return list.every((e) => EMAIL.test(e)) ? list : null;
}

export type GmailMessage = { to: string[]; subject: string; body: string } | { error: string };

export function buildGmailMessage(config: Record<string, string>, flowName: string): GmailMessage | null {
  const to = config["to"]?.trim();
  if (!to) return null;
  if (to.includes("{{")) return { error: "Replace {{…}} in “To” with a real email address to send for real." };
  const rcpts = parseRecipients(to);
  if (!rcpts) return { error: "“To” needs valid email addresses (up to 20, separated by commas)." };
  const subject = (config["subject"] || `Update from "${flowName}"`).replace(/[\r\n]+/g, " ").trim().slice(0, 250);
  const body = (config["body"] || config["fields"] || `Sent by your flow "${flowName}".`).slice(0, 50_000);
  return { to: rcpts, subject, body };
}

const b64 = (s: string) => btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
const header = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);

export function toRawEmail(m: { to: string[]; subject: string; body: string }): string {
  const email = [`To: ${m.to.join(", ")}`, `Subject: ${header(m.subject)}`, "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "", m.body].join("\r\n");
  return b64(email).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
