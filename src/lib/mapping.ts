import { NODES } from "./automation-catalog";
import type { Workflow, WorkflowNode } from "./workflow";

export type SemanticType = "email" | "person" | "phone" | "money" | "date" | "id" | "url" | "status" | "text";

const RULES: Array<{ type: SemanticType; test: RegExp }> = [
  { type: "email", test: /mail|recipient|sender/ },
  { type: "person", test: /name|contact|owner|customer|user|assignee|author/ },
  { type: "phone", test: /phone|msisdn|mobile|whatsapp/ },
  { type: "money", test: /amount|total|price|value|revenue|balance|cost|fee/ },
  { type: "date", test: /date|time|due|created|updated|expires|deadline/ },
  { type: "id", test: /\bid\b|_id|record|ticket|order|invoice|reference|ref\b/ },
  { type: "url", test: /url|link|webhook|endpoint|href/ },
  { type: "status", test: /status|stage|state|priority|category|label|score/ },
];

export function semanticType(key: string): SemanticType {
  const k = key.toLowerCase();
  for (const r of RULES) if (r.test.test(k)) return r.type;
  return "text";
}

/** Fields a step publishes downstream, derived from its own config surface. */
export function outputKeys(node: WorkflowNode): string[] {
  const def = NODES[node.defId];
  const base = ["id", "created_at", "status"];
  const own = def?.fields.map((f) => f.key) ?? [];
  return Array.from(new Set([...base, ...own, ...inferExtra(def?.tool ?? "")]));
}

function inferExtra(tool: string): string[] {
  const t = tool.toLowerCase();
  if (/mail|gmail|outlook/.test(t)) return ["subject", "body", "from_email", "to_email"];
  if (/stripe|paddle|mpesa|paypal|quickbooks|xero/.test(t)) return ["amount", "currency", "customer_email", "paid_at"];
  if (/hubspot|salesforce|pipedrive|zoho/.test(t)) return ["contact_name", "contact_email", "deal_value", "stage"];
  if (/slack|teams|discord|whatsapp/.test(t)) return ["channel", "message_text", "user_name"];
  if (/notion|airtable|sheets|monday/.test(t)) return ["title", "properties", "row_url"];
  return ["payload", "raw_text"];
}

export interface Suggestion {
  target: string;
  targetLabel: string;
  source: string;
  confidence: number;
  why: string;
}

/**
 * Semantic auto-matching: pairs upstream keys with downstream fields on meaning and
 * data type instead of JSON index paths, so no `{{$json[0]...}}` syntax is needed.
 */
export function suggestMapping(workflow: Workflow, node: WorkflowNode): Suggestion[] {
  const def = NODES[node.defId];
  if (!def) return [];
  const upstream = workflow.edges
    .filter((e) => e.to === node.id)
    .map((e) => workflow.nodes.find((n) => n.id === e.from))
    .filter((n): n is WorkflowNode => Boolean(n));
  const sources = upstream.length
    ? upstream.flatMap((u) => outputKeys(u).map((k) => ({ key: k, from: u.name })))
    : [{ key: "payload", from: "trigger" }, { key: "email", from: "trigger" }, { key: "amount", from: "trigger" }];

  return def.fields
    .map((f) => {
      const want = semanticType(f.key);
      let best: { key: string; from: string; score: number } | null = null;
      for (const s of sources) {
        const got = semanticType(s.key);
        let score = got === want ? 0.72 : 0.2;
        const fk = f.key.toLowerCase();
        const sk = s.key.toLowerCase();
        if (sk === fk) score = 0.99;
        else if (sk.includes(fk) || fk.includes(sk)) score = Math.max(score, 0.88);
        if (!best || score > best.score) best = { ...s, score };
      }
      if (!best) return null;
      const ref = `{{${best.from.toLowerCase().replace(/\s+/g, "_")}.${best.key}}}`;
      return {
        target: f.key,
        targetLabel: f.label,
        source: ref,
        confidence: Math.round(best.score * 100) / 100,
        why:
          best.score > 0.9
            ? "Exact field name match upstream."
            : `Both read as ${want} data — matched on meaning, not position.`,
      } satisfies Suggestion;
    })
    .filter((s): s is Suggestion => Boolean(s))
    .sort((a, b) => b.confidence - a.confidence);
}
