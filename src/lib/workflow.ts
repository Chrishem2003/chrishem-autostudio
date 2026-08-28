import { NODES, TEMPLATES, VERTICALS } from "./automation-catalog";

export interface WorkflowNode {
  id: string;
  defId: string;
  x: number;
  y: number;
  name: string;
  config: Record<string, string>;
}

export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
}

export interface Workflow {
  id: string;
  name: string;
  vertical: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  live: boolean;
  updatedAt: number;
}

export interface RunStep {
  nodeId: string;
  label: string;
  status: "ok" | "skipped" | "failed";
  ms: number;
  detail: string;
}

export const STORAGE_KEY = "automation-studio-v1";

let counter = 0;
export function uid(prefix: string) {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

export function makeNode(defId: string, x: number, y: number): WorkflowNode {
  const def = NODES[defId]!;
  return { id: uid("n"), defId, x, y, name: def.label, config: {} };
}

export function workflowFromTemplate(templateId: string): Workflow {
  const tpl = TEMPLATES.find((t) => t.id === templateId)!;
  const nodes = tpl.chain.map((defId, i) =>
    makeNode(defId, 80 + (i % 3) * 300, 80 + Math.floor(i / 3) * 190),
  );
  const edges: WorkflowEdge[] = nodes.slice(1).map((n, i) => ({
    id: uid("e"),
    from: nodes[i]!.id,
    to: n.id,
  }));
  return {
    id: uid("wf"),
    name: tpl.name,
    vertical: tpl.vertical,
    nodes,
    edges,
    live: false,
    updatedAt: Date.now(),
  };
}

export function blankWorkflow(vertical = VERTICALS[0]!.id): Workflow {
  const trigger = makeNode("trigger.webhook", 100, 140);
  return {
    id: uid("wf"),
    name: "Untitled flow",
    vertical,
    nodes: [trigger],
    edges: [],
    live: false,
    updatedAt: Date.now(),
  };
}

/** Topologically ordered node ids starting from triggers. */
export function orderedNodes(wf: Workflow): WorkflowNode[] {
  const byId = new Map(wf.nodes.map((n) => [n.id, n]));
  const incoming = new Map(wf.nodes.map((n) => [n.id, 0]));
  for (const e of wf.edges) incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
  const queue = wf.nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0).map((n) => n.id);
  const out: WorkflowNode[] = [];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (node) out.push(node);
    for (const e of wf.edges.filter((x) => x.from === id)) {
      const left = (incoming.get(e.to) ?? 1) - 1;
      incoming.set(e.to, left);
      if (left <= 0) queue.push(e.to);
    }
  }
  for (const n of wf.nodes) if (!seen.has(n.id)) out.push(n);
  return out;
}

export interface Issue {
  level: "error" | "warn";
  message: string;
  nodeId?: string;
}

export function validate(wf: Workflow): Issue[] {
  const issues: Issue[] = [];
  const triggers = wf.nodes.filter((n) => NODES[n.defId]?.kind === "trigger");
  if (triggers.length === 0) issues.push({ level: "error", message: "Add a trigger so the flow knows when to start." });
  if (triggers.length > 1) issues.push({ level: "warn", message: "Multiple triggers will each start their own run." });
  if (wf.nodes.length > 1 && wf.edges.length === 0)
    issues.push({ level: "error", message: "Nothing is connected yet — draw a link between two steps." });
  for (const n of wf.nodes) {
    const def = NODES[n.defId];
    if (!def) continue;
    const connected = wf.edges.some((e) => e.from === n.id || e.to === n.id);
    if (wf.nodes.length > 1 && !connected)
      issues.push({ level: "warn", message: `"${n.name}" is floating and will never run.`, nodeId: n.id });
    const missing = def.fields.filter((f) => !n.config[f.key]?.trim());
    if (missing.length)
      issues.push({
        level: "warn",
        message: `"${n.name}" is missing ${missing.map((f) => f.label.toLowerCase()).join(", ")}.`,
        nodeId: n.id,
      });
  }
  return issues;
}

export function simulateRun(wf: Workflow): RunStep[] {
  const order = orderedNodes(wf).filter((n) => wf.edges.some((e) => e.from === n.id || e.to === n.id) || wf.nodes.length === 1);
  let skipping = false;
  return order.map((n) => {
    const def = NODES[n.defId];
    const kind = def?.kind ?? "action";
    const ms = kind === "ai" ? 700 + Math.round(Math.random() * 900) : 40 + Math.round(Math.random() * 220);
    if (skipping) return { nodeId: n.id, label: n.name, status: "skipped" as const, ms: 0, detail: "Upstream filter stopped this branch." };
    if (n.defId === "logic.filter" && !n.config["condition"]) {
      skipping = true;
      return { nodeId: n.id, label: n.name, status: "failed" as const, ms, detail: "No condition set — nothing passes." };
    }
    return {
      nodeId: n.id,
      label: n.name,
      status: "ok" as const,
      ms,
      detail:
        kind === "trigger"
          ? "Payload received (1 item)."
          : kind === "ai"
            ? "Model returned structured output."
            : kind === "logic"
              ? "1 item passed."
              : `Delivered to ${def?.tool ?? "tool"}.`,
    };
  });
}

export function exportForN8n(wf: Workflow) {
  return {
    name: wf.name,
    nodes: wf.nodes.map((n, i) => {
      const def = NODES[n.defId];
      return {
        id: n.id,
        name: n.name,
        type: `lovable.${n.defId}`,
        typeVersion: 1,
        position: [Math.round(n.x), Math.round(n.y)],
        parameters: { tool: def?.tool ?? "core", ...n.config },
        notes: def?.summary ?? "",
        _order: i,
      };
    }),
    connections: wf.edges.reduce<Record<string, { main: Array<Array<{ node: string; type: string; index: number }>> }>>(
      (acc, e) => {
        const from = wf.nodes.find((n) => n.id === e.from);
        const to = wf.nodes.find((n) => n.id === e.to);
        if (!from || !to) return acc;
        acc[from.name] ??= { main: [[]] };
        acc[from.name]!.main[0]!.push({ node: to.name, type: "main", index: 0 });
        return acc;
      },
      {},
    ),
    settings: { executionOrder: "v1" },
    meta: { vertical: wf.vertical, generatedBy: "Automation Studio" },
  };
}
