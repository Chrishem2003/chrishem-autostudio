import { useMemo, useState } from "react";
import { buildTrace, type Trace } from "@/lib/trace";
import type { Workflow } from "@/lib/workflow";
import { cn } from "@/lib/utils";

interface Props {
  workflow: Workflow;
  onSelectNode: (id: string) => void;
}

/** Execution scrubber: caches every variable state so runs can be rewound and replayed. */
export function TimeTravelPanel({ workflow, onSelectNode }: Props) {
  const [trace, setTrace] = useState<Trace | null>(null);
  const [cursor, setCursor] = useState(0);
  const frame = trace?.frames[cursor] ?? null;
  const vars = useMemo(() => Object.entries(frame?.varsOut ?? {}), [frame]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="mono-label">Time-travel debugger</span>
        <button
          onClick={() => {
            const t = buildTrace(workflow);
            setTrace(t);
            setCursor(Math.max(0, t.frames.length - 1));
          }}
          className="ml-auto rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground"
        >
          {trace ? "Re-record run" : "Record a run"}
        </button>
      </div>

      {!trace ? (
        <p className="p-3 text-xs text-muted-foreground">
          Record a run to capture a snapshot of every variable at every step, then scrub back and
          forth to see exactly where data transformed or stalled.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-2 border-b border-border px-3 py-2">
            <input
              type="range"
              min={0}
              max={Math.max(0, trace.frames.length - 1)}
              value={cursor}
              onChange={(e) => {
                const i = Number(e.target.value);
                setCursor(i);
                const f = trace.frames[i];
                if (f) onSelectNode(f.nodeId);
              }}
              className="w-full accent-primary"
            />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                Step {cursor + 1} / {trace.frames.length}
              </span>
              <span>{trace.totalMs} ms total</span>
            </div>
            {frame ? (
              <div className="rounded-md border border-border bg-surface-raised p-2">
                <p className="text-xs font-semibold">{frame.label}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{frame.detail}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      frame.status === "ok"
                        ? "bg-action/15 text-action"
                        : frame.status === "failed"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {frame.status}
                  </span>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    +{frame.added.length} new · {frame.changed.length} changed
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <p className="mono-label mb-1.5">Variables at this point</p>
            <div className="space-y-1">
              {vars.map(([k, v]) => (
                <div
                  key={k}
                  className={cn(
                    "flex items-start gap-2 rounded-md px-2 py-1 text-[11px]",
                    frame?.added.includes(k)
                      ? "bg-action/10"
                      : frame?.changed.includes(k)
                        ? "bg-primary/10"
                        : "bg-surface-raised",
                  )}
                >
                  <code className="shrink-0 text-primary">{k}</code>
                  <span className="truncate text-muted-foreground">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
