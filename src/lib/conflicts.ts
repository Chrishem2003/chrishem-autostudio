import { NODES } from "./automation-catalog";
import type { Workflow } from "./workflow";

export interface Conflict {
  tool: string;
  flows: string[];
  detail: string;
}

/** Tools a flow writes to (action/output steps) and what starts it. */
function profile(wf: Workflow) {
  const writes = new Set<string>();
  let trigger = "";
  for (const n of wf.nodes) {
    const def = NODES[n.defId];
    if (!def) continue;
    if (def.kind === "trigger") trigger ||= def.tool ?? def.label;
    if ((def.kind === "action" || def.kind === "output") && def.tool) writes.add(def.tool);
  }
  return { writes, trigger };
}

/** Cross-automation conflict detection: flows writing to the same app. */
export function detectConflicts(flows: Array<{ name: string; flow: Workflow | null; status?: string }>): Conflict[] {
  const byTool = new Map<string, Array<{ name: string; trigger: string }>>();
  for (const f of flows) {
    if (!f.flow || f.status === "paused") continue;
    const p = profile(f.flow);
    for (const t of p.writes) {
      const list = byTool.get(t) ?? [];
      list.push({ name: f.name, trigger: p.trigger });
      byTool.set(t, list);
    }
  }
  return [...byTool.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([tool, list]) => {
      const sameTrigger = new Set(list.map((l) => l.trigger)).size < list.length;
      return {
        tool,
        flows: list.map((l) => l.name),
        detail: sameTrigger
          ? `These flows start from the same trigger and all write to ${tool} — expect duplicate or racing writes.`
          : `These flows all write to ${tool}. Check they don't post the same thing twice.`,
      };
    });
}

/** Impact simulation: what the last 30 days would have looked like. */
export function simulateImpact(wf: Workflow, runsPerDay: number) {
  const runs = Math.round(runsPerDay * 30);
  const effects = new Map<string, number>();
  for (const n of wf.nodes) {
    const def = NODES[n.defId];
    if (!def || (def.kind !== "action" && def.kind !== "output")) continue;
    effects.set(def.label, (effects.get(def.label) ?? 0) + runs);
  }
  return { runs, effects: [...effects.entries()].map(([label, count]) => ({ label, count })) };
}
