import { useMemo } from "react";
import { toast } from "sonner";
import { diagnose, explainFlow, scoreFlow } from "@/lib/doctor";
import type { Workflow } from "@/lib/workflow";
import { cn } from "@/lib/utils";

interface Props {
  workflow: Workflow | null;
  onUpdate: (fn: (wf: Workflow) => Workflow) => void;
}

export function DoctorPanel({ workflow, onUpdate }: Props) {
  const fixes = useMemo(() => (workflow ? diagnose(workflow) : []), [workflow]);
  const score = useMemo(() => (workflow ? scoreFlow(workflow) : null), [workflow]);
  const story = useMemo(() => (workflow ? explainFlow(workflow) : []), [workflow]);

  if (!workflow || !score) return <p className="p-3 text-sm text-muted-foreground">Open a flow to run the doctor.</p>;

  const repairable = fixes.filter((f) => f.id !== "review");

  return (
    <div className="space-y-3 p-3">
      <div className="rounded-lg border border-border bg-card/60 p-2.5">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-2xl font-semibold">{score.reliability}%</span>
          <span className="mono-label">production readiness</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-raised">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              score.reliability > 85 ? "bg-action" : score.reliability > 55 ? "bg-ai" : "bg-destructive",
            )}
            style={{ width: `${score.reliability}%` }}
          />
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <dt className="text-muted-foreground">Est. run time</dt>
            <dd className="font-medium">{(score.msPerRun / 1000).toFixed(1)}s</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Credits / run</dt>
            <dd className="font-medium">{score.creditsPerRun}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Runs / day</dt>
            <dd className="font-medium">{score.runsPerDay}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Est. monthly cost</dt>
            <dd className="font-medium">${score.monthlyCost.toFixed(2)}</dd>
          </div>
        </dl>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <p className="mono-label">Repairs</p>
          {repairable.length > 1 ? (
            <button
              onClick={() => {
                onUpdate((w) => repairable.reduce((acc, f) => f.apply(acc), w));
                toast.success(`Applied ${repairable.length} repairs.`);
              }}
              className="ml-auto rounded-md border border-primary/60 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary"
            >
              Fix everything
            </button>
          ) : null}
        </div>
        <div className="mt-2 space-y-1.5">
          {fixes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing to repair — this flow is clean.</p>
          ) : null}
          {fixes.map((f) => (
            <div key={f.id} className="rounded-lg border border-border bg-card/50 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className={cn("size-1.5 rounded-full", f.severity === "error" ? "bg-destructive" : "bg-ai")} />
                <span className="text-sm font-medium">{f.title}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{f.detail}</p>
              {f.id !== "review" ? (
                <button
                  onClick={() => {
                    onUpdate((w) => f.apply(w));
                    toast.success(f.title);
                  }}
                  className="mt-2 rounded-md border border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
                >
                  Apply fix
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface-raised p-2.5">
        <p className="mono-label">What this flow does</p>
        <ol className="mt-2 space-y-1 text-[11px] text-muted-foreground">
          {story.map((line, i) => (
            <li key={i}>
              <span className="mr-1 text-foreground">{i + 1}.</span>
              {line}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
