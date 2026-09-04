import { NODES } from "./automation-catalog";
import { suggestMapping } from "./mapping";
import { autoChain, autoLayout, makeNode, orderedNodes, validate, type Workflow } from "./workflow";

/**
 * Flow doctor. Every automation platform validates; almost none repair. The
 * doctor turns each validation issue into a concrete, one-click repair and can
 * apply all of them at once.
 */

export interface Fix {
  id: string;
  title: string;
  detail: string;
  severity: "error" | "warn";
  apply: (wf: Workflow) => Workflow;
}

export function diagnose(wf: Workflow): Fix[] {
  const fixes: Fix[] = [];
  const issues = validate(wf);
  const hasTrigger = wf.nodes.some((n) => NODES[n.defId]?.kind === "trigger");

  if (!hasTrigger) {
    fixes.push({
      id: "add-trigger",
      title: "Add a starting trigger",
      detail: "A flow needs one event that starts it. We'll prepend an inbound webhook trigger.",
      severity: "error",
      apply: (w) => {
        const node = makeNode("trigger.webhook", 60, 120);
        const first = orderedNodes(w)[0];
        return autoLayout(
          autoChain({
            ...w,
            nodes: [node, ...w.nodes],
            edges: first ? [{ id: `e_fix_${node.id}`, from: node.id, to: first.id }, ...w.edges] : w.edges,
          }),
        );
      },
    });
  }

  const floating = wf.nodes.filter(
    (n) => wf.nodes.length > 1 && !wf.edges.some((e) => e.from === n.id || e.to === n.id),
  );
  if (floating.length) {
    fixes.push({
      id: "connect-floating",
      title: `Connect ${floating.length} step${floating.length > 1 ? "s" : ""} that never run`,
      detail: floating.map((n) => `"${n.name}"`).join(", ") + " sit off the path. We'll wire them in order and tidy up.",
      severity: "error",
      apply: (w) => autoLayout(autoChain(w)),
    });
  }

  const unmapped = wf.nodes.filter((n) => {
    const def = NODES[n.defId];
    return def && def.fields.some((f) => !n.config[f.key]?.trim());
  });
  if (unmapped.length) {
    fixes.push({
      id: "auto-map",
      title: `Auto-map ${unmapped.length} step${unmapped.length > 1 ? "s" : ""} with blank fields`,
      detail: "Semantic matching fills each blank field from the closest upstream value — no JSON paths to write.",
      severity: "warn",
      apply: (w) => ({
        ...w,
        nodes: w.nodes.map((n) => {
          const def = NODES[n.defId];
          if (!def) return n;
          const suggestions = suggestMapping(w, n);
          const config = { ...n.config };
          for (const f of def.fields) {
            if (config[f.key]?.trim()) continue;
            const s = suggestions.find((x) => x.target === f.key);
            if (s) config[f.key] = s.source;
          }
          return { ...n, config };
        }),
      }),
    });
  }

  const triggers = wf.nodes.filter((n) => NODES[n.defId]?.kind === "trigger");
  if (triggers.length > 1) {
    fixes.push({
      id: "single-trigger",
      title: "Keep one trigger",
      detail: "Extra triggers each start their own run, which usually duplicates work. We'll keep the first.",
      severity: "warn",
      apply: (w) => {
        const keep = triggers[0]!.id;
        const drop = new Set(triggers.slice(1).map((n) => n.id));
        return autoLayout(
          autoChain({
            ...w,
            nodes: w.nodes.filter((n) => !drop.has(n.id) || n.id === keep),
            edges: w.edges.filter((e) => !drop.has(e.from) && !drop.has(e.to)),
          }),
        );
      },
    });
  }

  const hasOutput = wf.nodes.some((n) => NODES[n.defId]?.kind === "output");
  if (wf.nodes.length >= 2 && !hasOutput) {
    fixes.push({
      id: "add-audit",
      title: "Add an audit log so runs are traceable",
      detail: "Every production flow should record what it did. We'll append an audit log step at the end.",
      severity: "warn",
      apply: (w) => {
        const node = makeNode("output.log", 0, 0);
        return autoLayout(autoChain({ ...w, nodes: [...w.nodes, node] }));
      },
    });
  }

  // Issues with no automatic repair are still surfaced, read-only.
  if (fixes.length === 0 && issues.length > 0) {
    fixes.push({
      id: "review",
      title: "Manual review",
      detail: issues.map((i) => i.message).join(" "),
      severity: "warn",
      apply: (w) => w,
    });
  }
  return fixes;
}

export interface FlowScore {
  reliability: number;
  runsPerDay: number;
  msPerRun: number;
  creditsPerRun: number;
  monthlyCost: number;
}

/** Rough but honest operating estimate so users see cost before going live. */
export function scoreFlow(wf: Workflow): FlowScore {
  const kinds = wf.nodes.map((n) => NODES[n.defId]?.kind ?? "action");
  const aiSteps = kinds.filter((k) => k === "ai").length;
  const msPerRun = wf.nodes.length * 240 + aiSteps * 1400;
  const issues = validate(wf);
  const errors = issues.filter((i) => i.level === "error").length;
  const warns = issues.filter((i) => i.level === "warn").length;
  const reliability = Math.max(12, Math.min(99, 99 - errors * 28 - warns * 6));
  const runsPerDay = kinds.includes("trigger") ? 120 : 0;
  const creditsPerRun = Math.round((wf.nodes.length * 0.4 + aiSteps * 3.2) * 10) / 10;
  const monthlyCost = Math.round(creditsPerRun * runsPerDay * 30 * 0.004 * 100) / 100;
  return { reliability, runsPerDay, msPerRun, creditsPerRun, monthlyCost };
}

/** Plain-language narrative of the pipeline — the "explain this flow" feature. */
export function explainFlow(wf: Workflow): string[] {
  const order = orderedNodes(wf);
  if (order.length === 0) return ["This canvas is empty. Describe an outcome in the Copilot bar to generate a pipeline."];
  return order.map((n, i) => {
    const def = NODES[n.defId];
    const kind = def?.kind ?? "action";
    const lead =
      i === 0 && kind === "trigger"
        ? "When"
        : kind === "logic"
          ? "Only continue if"
          : kind === "ai"
            ? "Then the AI will"
            : kind === "output"
              ? "Finally"
              : "Then";
    return `${lead} ${def ? `${def.summary.charAt(0).toLowerCase()}${def.summary.slice(1)}` : n.name} (${def?.tool ?? "step"}).`;
  });
}
