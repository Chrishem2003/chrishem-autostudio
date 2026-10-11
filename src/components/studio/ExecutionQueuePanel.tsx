import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyExecutionQueue } from "@/lib/execution-queue.functions";
import { cn } from "@/lib/utils";

const queueLabels = [
  ["queued", "Queued"],
  ["running", "Running"],
  ["succeeded", "Succeeded"],
  ["failed", "Failed"],
  ["needs_review", "Needs review"],
  ["dead_letter", "Dead letter"],
] as const;

export function ExecutionQueuePanel() {
  const list = useServerFn(listMyExecutionQueue);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["my-execution-queue"],
    queryFn: () => list(),
    refetchInterval: 30000,
    staleTime: 10000,
  });
  const counts = q.data?.counts;

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading execution queue…</p>;
  if (q.error) return (
    <div role="alert" className="rounded-xl border border-destructive/40 p-4">
      <p className="text-sm font-medium">Queue status could not be loaded</p>
      <p className="mt-1 text-xs text-muted-foreground">Check your connection and retry. Your existing automations are unaffected.</p>
      <button onClick={() => void q.refetch()} className="mt-3 rounded-md border border-border px-3 py-1.5 text-sm">Try again</button>
    </div>
  );

  return (
    <section className="space-y-5" aria-label="Execution queue monitoring">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Durable jobs requested by your account</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {q.data ? "Last checked " + new Date(q.data.sampledAt).toLocaleTimeString() : "Status refreshes automatically."}
          </p>
        </div>
        <button onClick={() => void qc.invalidateQueries({ queryKey: ["my-execution-queue"] })} disabled={q.isFetching}
          className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-raised disabled:opacity-50">
          {q.isFetching ? "Refreshing…" : "Refresh status"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {queueLabels.map(([key, label]) => (
          <div key={key} className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={cn("mt-2 font-display text-2xl font-semibold tabular-nums",
              (key === "needs_review" || key === "dead_letter" || key === "failed") && (counts?.[key] ?? 0) > 0
                ? "text-destructive" : "text-foreground")}>{counts?.[key] ?? 0}</p>
          </div>
        ))}
      </div>
      {(counts?.needs_review ?? 0) > 0 && (
        <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <p className="font-semibold">Human review required</p>
          <p className="mt-1 text-muted-foreground">Verify the destination service before manually retrying uncertain actions to avoid duplicate sends or writes.</p>
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div><h2 className="text-sm font-semibold">Recent execution jobs</h2><p className="mt-1 text-xs text-muted-foreground">Up to 25 most recent jobs</p></div>
          <span className="text-xs text-muted-foreground">{q.data?.jobs.length ?? 0} jobs</span>
        </div>
        {!q.data?.jobs.length ? (
          <div className="p-8 text-center"><p className="text-sm font-medium">No durable jobs yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Jobs appear here when an automation is submitted to the durable execution queue.</p></div>
        ) : (
          <div className="divide-y divide-border">
            {q.data.jobs.map((job) => (
              <article key={job.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-md border px-2 py-0.5 text-xs font-semibold",
                      job.status === "succeeded" ? "border-primary/40 bg-primary/10 text-primary"
                        : job.status === "failed" || job.status === "dead_letter" ? "border-destructive/40 bg-destructive/5 text-destructive"
                        : job.status === "needs_review" ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        : "border-border text-foreground")}>{job.status.replaceAll("_", " ")}</span>
                    <span className="text-xs text-muted-foreground">{job.triggerType} trigger</span>
                  </div>
                  <span className="mono-label">{new Date(job.createdAt).toLocaleString()}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Attempts: {job.attempts}/{job.maxAttempts}</span>
                  {job.status === "queued" && <span>Next eligible: {new Date(job.availableAt).toLocaleString()}</span>}
                  <span>Updated: {new Date(job.updatedAt).toLocaleString()}</span>
                </div>
                {job.error && <p className="rounded-lg bg-surface-raised p-2 text-xs text-muted-foreground">{job.error}</p>}
                {job.status === "needs_review" && <p className="text-xs text-amber-700 dark:text-amber-300">Check provider activity before retrying this job.</p>}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
