import { NODES } from "./automation-catalog";
import { APPS } from "./integrations";
import type { Workflow } from "./workflow";

/**
 * Connection registry. Every step declares the tool it talks to; this maps the
 * tools used in a flow to the app catalog so the studio can tell the user
 * exactly which accounts still need authorising before a flow can go live.
 */

export const CONNECTIONS_KEY = "automation-studio-connections-v1";

export interface Connection {
  tool: string;
  account: string;
  auth: "oauth2" | "apiKey" | "basic" | "none";
  connectedAt: number;
}

const APP_BY_NAME = new Map(APPS.map((a) => [a.name.toLowerCase(), a]));

export function appForTool(tool: string) {
  return APP_BY_NAME.get(tool.toLowerCase());
}

export function authForTool(tool: string): Connection["auth"] {
  return appForTool(tool)?.auth ?? "none";
}

export const AUTH_LABEL: Record<Connection["auth"], string> = {
  oauth2: "One-click OAuth",
  apiKey: "API key",
  basic: "Username & password",
  none: "No account needed",
};

/** Distinct tools a flow touches, with the step count that depends on each. */
export function requiredTools(wf: Workflow | null): Array<{ tool: string; steps: number; auth: Connection["auth"] }> {
  if (!wf) return [];
  const counts = new Map<string, number>();
  for (const n of wf.nodes) {
    const tool = NODES[n.defId]?.tool;
    if (!tool) continue;
    counts.set(tool, (counts.get(tool) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tool, steps]) => ({ tool, steps, auth: authForTool(tool) }))
    .filter((t) => t.auth !== "none")
    .sort((a, b) => b.steps - a.steps || a.tool.localeCompare(b.tool));
}

export function loadConnections(): Connection[] {
  try {
    const raw = localStorage.getItem(CONNECTIONS_KEY);
    return raw ? (JSON.parse(raw) as Connection[]) : [];
  } catch {
    return [];
  }
}

export function saveConnections(list: Connection[]) {
  try {
    localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(list));
  } catch {
    /* storage blocked — connections stay in memory for this session */
  }
}

export function suggestAccount(tool: string) {
  return `${tool.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@workspace`;
}
