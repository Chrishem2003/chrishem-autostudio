import { useEffect, useState } from "react";
import { detectDrift, healLabel, type DriftEvent } from "@/lib/healing";
import type { Workflow } from "@/lib/workflow";
import { NODES } from "@/lib/automation-catalog";

interface Props {
  workflow: Workflow;
  onHeal: (nodeId: string, fieldKey: string, value: string) => void;
  onSelectNode: (id: string) => void;
}

/** Autonomous error healing: schema drift is detected and mappings rewritten in place. */
export function HealingPanel({ workflow, onHeal, onSelectNode }: Props) {
  const [events, setEvents] = useState<DriftEvent[]>([]);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    setEvents(detectDrift(workflow));
  }, [workflow]);

  const apply = (ev: DriftEvent) => {
    const def = NODES[workflow.nodes.find((n) => n.id === ev.nodeId)?.defId ?? ""];
    const field = def?.fields.find((f) => f.label === ev.field);
    if (field) onHeal(ev.nodeId, field.key, ev.newRef);
    setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, healed: true } : e)));
  };

  const open = events.filter((e) => !e.healed);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="mono-label">Autonomous healing</span>
        <button
          onClick={() => setAuto((a) => !a)}
          className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
            auto ? "border-action/60 bg-action/15 text-action" : "border-border text-muted-foreground"
          }`}
        >
          {auto ? "Auto-heal on" : "Auto-heal off"}
        </button>
        {open.length ? (
          <button
            onClick={() => open.forEach(apply)}
            className="rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground"
          >
            Heal all
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No payload drift detected. Every configured reference still matches what its tool
            returns — the watcher keeps checking on each run.
          </p>
        ) : null}
        {events.map((ev) => (
          <div
            key={ev.id}
            className="rounded-lg border border-border bg-card/60 p-2.5"
            onClick={() => onSelectNode(ev.nodeId)}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold">{ev.nodeName}</span>
              <span className="mono-label">{ev.tool}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">
                {Math.round(ev.confidence * 100)}% sure
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{healLabel(ev.kind)}</p>
            <div className="mt-1.5 space-y-1 text-[11px]">
              <code className="block truncate text-destructive line-through">{ev.oldRef}</code>
              <code className="block truncate text-action">{ev.newRef}</code>
            </div>
            {ev.healed ? (
              <p className="mt-1.5 text-[10px] font-semibold text-action">Healed · run unblocked</p>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  apply(ev);
                }}
                className="mt-1.5 rounded-md border border-primary/60 px-2 py-0.5 text-[10px] font-semibold text-primary"
              >
                Apply rewrite to {ev.field}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
