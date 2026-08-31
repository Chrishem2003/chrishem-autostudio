import { NODES, type NodeDef, type NodeKind } from "./automation-catalog";

export interface PlannedStep {
  defId: string;
  name: string;
  config: Record<string, string>;
  reason: string;
}

export interface Plan {
  intent: string;
  steps: PlannedStep[];
  source: "ai" | "local";
  notes: string[];
}

const STOP = new Set(
  "a an the and or of for to into from with in on at by then when if my our their your all any it this that new create make build i want need should also please".split(
    " ",
  ),
);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function scoreDef(def: NodeDef, words: string[]): number {
  const haystack = `${def.label} ${def.tool} ${def.summary}`.toLowerCase();
  let score = 0;
  for (const w of words) {
    if (haystack.includes(w)) score += w.length > 5 ? 3 : 2;
    if (def.tool.toLowerCase() === w) score += 6;
    if (def.label.toLowerCase().startsWith(w)) score += 2;
  }
  return score;
}

const KIND_SEQUENCE: NodeKind[] = ["trigger", "logic", "ai", "action", "output"];

const HINTS: Array<{ test: RegExp; defId: string; reason: string }> = [
  { test: /\bschedule|every (day|hour|week|morning)|daily|nightly|cron\b/, defId: "trigger.schedule", reason: "Recurring wording implies a schedule trigger." },
  { test: /\bform|submit|inbound|webhook|api call\b/, defId: "trigger.webhook", reason: "Inbound event implies a webhook trigger." },
  { test: /\bemail (arrives|received)|inbox\b/, defId: "trigger.email", reason: "Mailbox wording implies an inbound email trigger." },
  { test: /\bonly if|if |when .* is|qualif|threshold|above|below\b/, defId: "logic.filter", reason: "Conditional wording adds a filter gate." },
  { test: /\bclassif|categor|route|triage\b/, defId: "ai.classify", reason: "Routing wording adds AI classification." },
  { test: /\bextract|parse|pull fields|read the\b/, defId: "ai.extract", reason: "Field extraction wording adds an AI extractor." },
  { test: /\bsummar|digest|brief\b/, defId: "ai.summarize", reason: "Summary wording adds an AI summarizer." },
  { test: /\bapprov|sign-?off|review by\b/, defId: "logic.approval", reason: "Sign-off wording inserts a human approval step." },
  { test: /\bwait|delay|after \d+\b/, defId: "logic.delay", reason: "Timing wording inserts a wait." },
];

function pick(id: string): NodeDef | undefined {
  return NODES[id];
}

/** Deterministic, offline pipeline composer used directly and as the AI fallback. */
export function planFromIntent(intent: string, vertical?: string): Plan {
  const words = tokens(intent);
  const notes: string[] = [];
  const chosen: PlannedStep[] = [];
  const used = new Set<string>();

  const add = (defId: string, reason: string) => {
    const def = pick(defId);
    if (!def || used.has(defId)) return;
    used.add(defId);
    chosen.push({ defId, name: def.label, config: seedConfig(def, intent), reason });
  };

  for (const h of HINTS) if (h.test.test(intent.toLowerCase())) add(h.defId, h.reason);

  const ranked = Object.values(NODES)
    .map((def) => ({ def, score: scoreDef(def, words) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  const byKind = (kind: NodeKind, limit: number) =>
    ranked.filter((r) => r.def.kind === kind).slice(0, limit);

  if (!chosen.some((s) => NODES[s.defId]?.kind === "trigger")) {
    const t = byKind("trigger", 1)[0];
    add(t ? t.def.id : "trigger.webhook", t ? `"${t.def.tool}" matched your wording.` : "Default inbound trigger.");
  }
  for (const r of byKind("ai", 2)) add(r.def.id, `AI step matching "${r.def.tool}".`);
  for (const r of byKind("action", 4)) add(r.def.id, `Detected the ${r.def.tool} tool in your request.`);
  for (const r of byKind("output", 1)) add(r.def.id, "Closing step to report the result.");

  if (chosen.length < 3) {
    add("ai.classify", "Added a reasoning step so the flow can decide.");
    add("output.log", "Added an audit log so every run is traceable.");
    notes.push("Your description was short — mention the exact tools to get a tighter pipeline.");
  }

  const ordered = chosen
    .slice()
    .sort((a, b) => KIND_SEQUENCE.indexOf(NODES[a.defId]!.kind) - KIND_SEQUENCE.indexOf(NODES[b.defId]!.kind))
    .slice(0, 8);

  if (vertical) notes.push(`Composed for the ${vertical} section.`);
  return { intent, steps: ordered, source: "local", notes };
}

/** Pre-fill obvious config values straight from the sentence. */
function seedConfig(def: NodeDef, intent: string): Record<string, string> {
  const config: Record<string, string> = {};
  const channel = intent.match(/#([a-z0-9-_]+)/i)?.[1];
  const email = intent.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0];
  for (const f of def.fields) {
    const key = f.key.toLowerCase();
    if (channel && key.includes("channel")) config[f.key] = `#${channel}`;
    else if (email && (key.includes("email") || key.includes("to"))) config[f.key] = email;
    else if (key.includes("prompt") || key.includes("instruction")) config[f.key] = intent;
    else if (key.includes("condition")) config[f.key] = "{{trigger.payload.score}} > 70";
  }
  return config;
}

/** Compact candidate list handed to the model so the payload stays small. */
export function candidatesFor(intent: string, limit = 60) {
  const words = tokens(intent);
  return Object.values(NODES)
    .map((def) => ({ def, score: scoreDef(def, words) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ def }) => ({ id: def.id, label: def.label, kind: def.kind, tool: def.tool, summary: def.summary }));
}
