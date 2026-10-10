import { useEffect, useState } from "react";
import { detectDrift, healLabel, type DriftEvent } from "@/lib/healing";
import type { Workflow } from "@/lib/workflow";
import { NODES } from "@/lib/automation-catalog";

interface Props {
  workflow: Workflow;
  onHeal: (nodeId: string, fieldKey: string, value: string) => void;
  onSelectNode: (id: string) => void;
}

/**
 * Preview-only illustration of possible schema-drift rewrites.
 * No live provider schema snapshots are connected yet, so generated suggestions
 * must not be presented as detected incidents or applied to production flows.
 */
export function HealingPanel({ workflow, onSelectNode }: Props) {
  const [events, setEvents] = useState<DriftEvent[]>([]);

  useEffect(() => {
    setEvents(detectDrift(workflow));
  }, [workflow]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="mono-label">Healing preview</span>
        <span className="ml-auto rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          Preview only
        </span>
      </div>

      <div className="border-b border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
        These are illustrative schema-drift examples generated from the flow shape, not live provider
        responses. Live schema checks and safe auto-repair are not connected yet, so applying rewrites
        is intentionally disabled.
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No illustrative drift scenarios matched this flow. This does not mean the connected
            providers have been checked.
          </p>
        ) : null}
        {events.map((ev) => {
          const def = NODES[workflow.nodes.find((node) => node.id === ev.nodeId)?.defId ?? ""];
          const field = def?.fields.find((candidate) => candidate.label === ev.field);
          return (
            <div
              key={ev.id}
              className="rounded-lg border border-border bg-card/60 p-2.5"
            >
              <button
                type="button"
                onClick={() => onSelectNode(ev.nodeId)}
                className="flex w-full items-center gap-2 text-left"
              >
                <span className="text-xs font-semibold">{ev.nodeName}</span>
                <span className="mono-label">{ev.tool}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">Example</span>
              </button>
              <p className="mt-1 text-[11px] text-muted-foreground">{healLabel(ev.kind)}</p>
              <div className="mt-1.5 space-y-1 text-[11px]">
                <code className="block truncate text-destructive line-through">{ev.oldRef}</code>
                <code className="block truncate text-muted-foreground">{ev.newRef}</code>
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                {field ? `Example mapping for ${field.label}; not validated against a real response.` : "Example only; no live schema validation is available."}
              </p>
              <button
                type="button"
                disabled
                title="Live schema validation is not implemented yet."
                className="mt-1.5 cursor-not-allowed rounded-md border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground opacity-70"
              >
                Apply rewrite unavailable in Preview
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
