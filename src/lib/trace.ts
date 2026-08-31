import { NODES } from "./automation-catalog";
import { outputKeys } from "./mapping";
import { orderedNodes, simulateRun, type RunStep, type Workflow } from "./workflow";

export interface TraceFrame extends RunStep {
  index: number;
  at: number;
  varsIn: Record<string, unknown>;
  varsOut: Record<string, unknown>;
  added: string[];
  changed: string[];
}

export interface Trace {
  id: string;
  workflowId: string;
  workflowName: string;
  startedAt: number;
  frames: TraceFrame[];
  totalMs: number;
}

function sampleValue(key: string, seed: number): unknown {
  const k = key.toLowerCase();
  if (k.includes("mail")) return `contact${seed % 90}@example.com`;
  if (k.includes("amount") || k.includes("value")) return Number((120 + (seed % 880) + 0.5).toFixed(2));
  if (k.includes("date") || k.includes("_at")) return new Date(Date.now() - (seed % 72) * 3600_000).toISOString();
  if (k === "status" || k.includes("stage")) return ["new", "qualified", "won"][seed % 3];
  if (k.includes("id")) return `rec_${(seed % 99999).toString(36)}`;
  if (k.includes("url") || k.includes("link")) return "https://example.com/record/42";
  return `value_${seed % 50}`;
}

/** Records a full variable snapshot at every step so runs can be rewound and replayed. */
export function buildTrace(workflow: Workflow): Trace {
  const steps = simulateRun(workflow);
  const order = orderedNodes(workflow);
  let vars: Record<string, unknown> = {
    "trigger.receivedAt": new Date().toISOString(),
    "trigger.items": 1,
  };
  let clock = Date.now();
  const frames: TraceFrame[] = steps.map((step, index) => {
    const node = order.find((n) => n.id === step.nodeId);
    const varsIn = { ...vars };
    const scope = (node?.name ?? "step").toLowerCase().replace(/\s+/g, "_");
    const added: string[] = [];
    const changed: string[] = [];
    if (node && step.status !== "skipped") {
      for (const key of outputKeys(node).slice(0, 6)) {
        const full = `${scope}.${key}`;
        const value = sampleValue(key, key.length + index * 7 + scope.length);
        if (full in vars) changed.push(full);
        else added.push(full);
        vars = { ...vars, [full]: value };
      }
      const def = NODES[node.defId];
      if (def?.kind === "ai") {
        vars = { ...vars, [`${scope}.confidence`]: Number((0.7 + (index % 3) / 10).toFixed(2)) };
        added.push(`${scope}.confidence`);
      }
    }
    clock += step.ms;
    return { ...step, index, at: clock, varsIn, varsOut: { ...vars }, added, changed };
  });

  return {
    id: `trace_${Date.now().toString(36)}`,
    workflowId: workflow.id,
    workflowName: workflow.name,
    startedAt: Date.now(),
    frames,
    totalMs: frames.reduce((sum, f) => sum + f.ms, 0),
  };
}
