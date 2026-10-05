/**
 * Real chat messages via each app's "incoming webhook" link — no developer keys needed.
 * Pure: turns a step + its settings into the exact request to send, or null if it isn't a live chat step.
 */
export const CHAT_HOSTS: Record<string, string[]> = {
  Slack: ["hooks.slack.com"],
  Discord: ["discord.com", "discordapp.com"],
  "Microsoft Teams": [".webhook.office.com", ".logic.azure.com", ".powerplatform.com"],
  Mattermost: [],
};

export function isChatMessageStep(defId: string, tool: string | undefined): boolean {
  if (!tool || !(tool in CHAT_HOSTS)) return false;
  return defId === "action.slack" || /^app\.[^.]+\.create\.message$/.test(defId);
}

function hostAllowed(tool: string, host: string): boolean {
  const list = CHAT_HOSTS[tool] ?? [];
  if (list.length === 0) return true; // self-hosted apps (Mattermost) live on any public address
  return list.some((h) => (h.startsWith(".") ? host.endsWith(h) : host === h || host.endsWith(`.${h}`)));
}

export type ChatRequest = { url: string; body: string } | { error: string };

export function buildChatRequest(tool: string, config: Record<string, string>, flowName: string): ChatRequest | null {
  const link = config["webhook"]?.trim();
  if (!link) return null;
  let host: string;
  try {
    const u = new URL(link);
    if (u.protocol !== "https:") return { error: "Use the full https:// webhook link from the app." };
    host = u.hostname.toLowerCase();
  } catch {
    return { error: "That webhook link isn't valid — paste the whole link." };
  }
  if (!hostAllowed(tool, host)) return { error: `That doesn't look like a ${tool} webhook link.` };
  const text = (config["message"] || config["fields"] || `New update from "${flowName}"`).trim().slice(0, 1900);
  const body = tool === "Discord" ? { content: text } : { text };
  return { url: link, body: JSON.stringify(body) };
}
