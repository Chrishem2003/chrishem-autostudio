import type { Issue, RunStep } from "@/lib/workflow";
import { cn } from "@/lib/utils";

interface Props {
  issues: Issue[];
  steps: RunStep[];
  running: boolean;
  onRun: () => void;
  onExport: () => void;
  onSelectNode: (id: string) => void;
}

export function RunPanel({ issues, steps, running, onRun, onExport, onSelectNode }: Props) {
  const total = steps.reduce((sum, s) => sum + s.ms, 0);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <button
          onClick={onRun}
          disabled={running}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {running ? "Running…" : "Test run"}
        </button>
        <button
          onClick={onExport}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary/60"
        >
          Export for n8n
        </button>
        {steps.length > 0 && !running ? (
          <span className="ml-auto font-mono text-xs text-muted-foreground">{total} ms</span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {issues.length > 0 ? (
          <div className="mb-3 space-y-1.5">
            <p className="mono-label">Checks</p>
            {issues.map((i, idx) => (
              <button
                key={idx}
                onClick={() => i.nodeId && onSelectNode(i.nodeId)}
                className={cn(
                  "block w-full rounded-md border px-2.5 py-1.5 text-left text-xs",
                  i.level === "error"
                    ? "border-destructive/50 bg-destructive/10 text-destructive-foreground"
                    : "border-primary/40 bg-primary/8 text-foreground/90",
                )}
              >
                {i.message}
              </button>
            ))}
          </div>
        ) : (
          <p className="mb-3 rounded-md border border-action/40 bg-action/10 px-2.5 py-1.5 text-xs text-action">
            All checks passed — this flow is ready to go live.
          </p>
        )}

        <p className="mono-label mb-2">Run log</p>
        {steps.length === 0 ? (
          <p className="text-xs text-muted-foreground">No runs yet. Hit “Test run” to walk the flow step by step.</p>
        ) : (
          <ol className="space-y-1.5">
            {steps.map((s, i) => (
              <li
                key={`${s.nodeId}-${i}`}
                className="rounded-md border border-border bg-card/60 px-2.5 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      s.status === "ok" ? "bg-action" : s.status === "skipped" ? "bg-muted-foreground" : "bg-destructive",
                    )}
                  />
                  <span className="font-medium">{s.label}</span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">{s.ms} ms</span>
                </div>
                <p className="mt-1 pl-3.5 text-muted-foreground">{s.detail}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
