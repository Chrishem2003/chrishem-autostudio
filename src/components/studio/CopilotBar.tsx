import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { composeFlow } from "@/lib/copilot.functions";
import { candidatesFor, planFromIntent, type Plan } from "@/lib/intent";
import { NODES } from "@/lib/automation-catalog";
import { KIND_STYLE } from "./kind-styles";
import { cn } from "@/lib/utils";

interface Props {
  vertical: string;
  flowName?: string;
  onApply: (plan: Plan, mode?: "new" | "append") => void;
}

const EXAMPLES = [
  "Qualify inbound leads, run a credit check, and sync to HubSpot",
  "Every morning summarise new Notion tasks and post them to #standup",
  "When an invoice is 7 days overdue, email the client and log it",
];

export function CopilotBar({ vertical, onApply }: Props) {
  const [intent, setIntent] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const compose = useServerFn(composeFlow);

  const run = async (text: string) => {
    const value = text.trim();
    if (value.length < 3 || busy) return;
    setBusy(true);
    const fallback = planFromIntent(value, vertical);
    try {
      const res = await compose({ data: { intent: value, vertical, candidates: candidatesFor(value) } });
      if (res.ok && res.defIds.length) {
        setPlan({
          intent: value,
          source: "ai",
          notes: [res.rationale].filter(Boolean),
          steps: res.defIds.map((defId) => ({
            defId,
            name: NODES[defId]?.label ?? defId,
            config: fallback.steps.find((s) => s.defId === defId)?.config ?? {},
            reason: NODES[defId]?.summary ?? "",
          })),
        });
      } else {
        setPlan({ ...fallback, notes: [...fallback.notes, res.error ?? "Planned offline."] });
      }
    } catch {
      setPlan({ ...fallback, notes: [...fallback.notes, "Planned offline — the AI planner was unreachable."] });
    }
    setBusy(false);
  };

  return (
    <div className="rounded-xl border border-primary/40 bg-card/90 p-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="mono-label text-primary">Copilot · describe the outcome</span>
        {busy ? <span className="text-[10px] text-muted-foreground">composing…</span> : null}
      </div>
      <textarea
        rows={2}
        value={intent}
        onChange={(e) => setIntent(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void run(intent);
        }}
        placeholder="Qualify inbound leads, run a credit check, and sync to HubSpot"
        className="mt-2 w-full resize-none rounded-lg border border-input bg-surface-raised px-3 py-2 text-sm outline-none focus:border-primary"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void run(intent)}
          disabled={busy}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          Build the pipeline
        </button>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => {
              setIntent(ex);
              void run(ex);
            }}
            className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
          >
            {ex.length > 38 ? `${ex.slice(0, 38)}…` : ex}
          </button>
        ))}
      </div>

      {plan ? (
        <div className="mt-3 rounded-lg border border-border bg-surface-raised p-2.5">
          <div className="flex items-center gap-2">
            <span className="mono-label">
              {plan.source === "ai" ? "AI-composed pipeline" : "Composed offline"} · {plan.steps.length} steps
            </span>
            <button
              onClick={() => {
                onApply(plan);
                setPlan(null);
              }}
              className="ml-auto rounded-md border border-primary/60 px-2 py-1 text-[11px] font-semibold text-primary"
            >
              Provision on canvas
            </button>
          </div>
          <ol className="mt-2 space-y-1">
            {plan.steps.map((s, i) => {
              const kind = NODES[s.defId]?.kind ?? "action";
              return (
                <li key={`${s.defId}-${i}`} className="flex items-start gap-2 text-xs">
                  <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", KIND_STYLE[kind].dot)} />
                  <span className="font-medium">{s.name}</span>
                  <span className="truncate text-muted-foreground">— {s.reason}</span>
                </li>
              );
            })}
          </ol>
          {plan.notes.length ? (
            <p className="mt-2 text-[11px] text-muted-foreground">{plan.notes.join(" ")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
