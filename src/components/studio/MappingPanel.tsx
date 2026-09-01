import { useMemo } from "react";
import { suggestMapping } from "@/lib/mapping";
import type { Workflow, WorkflowNode } from "@/lib/workflow";

interface Props {
  workflow: Workflow;
  node: WorkflowNode | null;
  onApply: (nodeId: string, fieldKey: string, value: string) => void;
}

/** Zero-schema mapping: fields are matched by meaning and type, no JSON paths to write. */
export function MappingPanel({ workflow, node, onApply }: Props) {
  const suggestions = useMemo(() => (node ? suggestMapping(workflow, node) : []), [workflow, node]);

  if (!node) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        Select a step on the canvas to see its auto-matched inputs.
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="mono-label">Semantic mapping · {node.name}</span>
        {suggestions.length ? (
          <button
            onClick={() => suggestions.forEach((s) => onApply(node.id, s.target, s.source))}
            className="ml-auto rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground"
          >
            Accept all
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {suggestions.length === 0 ? (
          <p className="text-xs text-muted-foreground">This step takes no inputs to map.</p>
        ) : null}
        {suggestions.map((s) => {
          const applied = node.config[s.target] === s.source;
          return (
            <div key={s.target} className="rounded-lg border border-border bg-card/60 p-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold">{s.targetLabel}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {Math.round(s.confidence * 100)}% match
                </span>
              </div>
              <code className="mt-1 block truncate text-[11px] text-primary">{s.source}</code>
              <p className="mt-1 text-[11px] text-muted-foreground">{s.why}</p>
              <button
                disabled={applied}
                onClick={() => onApply(node.id, s.target, s.source)}
                className="mt-1.5 rounded-md border border-primary/60 px-2 py-0.5 text-[10px] font-semibold text-primary disabled:border-border disabled:text-muted-foreground"
              >
                {applied ? "Applied" : "Use this mapping"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
