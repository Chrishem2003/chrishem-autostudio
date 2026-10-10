import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { STORAGE_KEY, type Workflow } from "@/lib/workflow";
import {
  deleteAutomation,
  disconnectIntegration,
  listAutomations,
  listIntegrations,
  listRuns,
  listVersions,
  restoreVersion,
  setAutomationStatus,
  verifyIntegration,
} from "@/lib/cloud.functions";
import { explainFailure } from "@/lib/assist.functions";
import { detectConflicts } from "@/lib/conflicts";
import { cn } from "@/lib/utils";
import { setPublished } from "@/lib/gallery.functions";

export const Route = createFileRoute("/_authenticated/workspace")({
  head: () => ({
    meta: [
      { title: "My Workspace — Chrishem AutoStudio" },
      { name: "description", content: "Your saved automations, versions, run history and connected apps." },
      { property: "og:title", content: "My Workspace — Chrishem AutoStudio" },
      { property: "og:description", content: "Your saved automations, versions, run history and connected apps." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Workspace,
});

type Section = "automations" | "runs" | "integrations";

function healthTone(h: number) {
  return h >= 80 ? "text-primary" : h >= 50 ? "text-foreground" : "text-destructive";
}

function Workspace() {
  const [section, setSection] = useState<Section>("automations");
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground max-md:flex-col">
      <aside className="w-56 shrink-0 border-r border-border bg-surface p-4 max-md:w-full max-md:border-b max-md:border-r-0">
        <Link to="/" className="font-display text-sm font-semibold">Chrishem AutoStudio</Link>
        <nav aria-label="Workspace navigation" className="mt-6 space-y-1 text-sm max-md:flex max-md:flex-wrap max-md:gap-1 max-md:space-y-0">
          {(
            [
              ["automations", "My Automations"],
              ["runs", "Run History"],
              ["integrations", "Integrations"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} onClick={() => setSection(id)}
              aria-current={section === id ? "page" : undefined}
              className={cn("rounded-lg px-3 py-2 text-left transition-colors", section === id ? "bg-primary/10 text-foreground ring-1 ring-primary/30" : "text-muted-foreground hover:bg-surface-raised hover:text-foreground")}>
              {label}
            </button>
          ))}
          <Link to="/marketplace" className="rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground">Marketplace</Link>
          <Link to="/gallery" className="rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground">Community gallery</Link>
          <Link to="/impact" className="rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground">Impact & plans</Link>
          <Link to="/sdk" className="rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground">Embed SDK</Link>
        </nav>
        <div className="mt-10 border-t border-border pt-4 text-xs text-muted-foreground max-md:mt-4">
          <p className="truncate">{user.email}</p>
          <button onClick={signOut} className="mt-2 text-primary">Sign out</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6 max-sm:p-4">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-xl font-semibold">
            {section === "automations" ? "My Automations" : section === "runs" ? "Run History" : "Integrations"}
          </h1>
          <Link to="/" className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">+ New Automation</Link>
        </div>
        {section === "automations" && <Automations />}
        {section === "runs" && <Runs />}
        {section === "integrations" && <Integrations />}
      </main>
    </div>
  );
}

function Automations() {
  const list = useServerFn(listAutomations);
  const del = useServerFn(deleteAutomation);
  const status = useServerFn(setAutomationStatus);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const q = useQuery({ queryKey: ["automations"], queryFn: () => list() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["automations"] });

  const share = useServerFn(setPublished);
  const openInStudio = (flow: Workflow, cloudId: string) => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const local = raw ? (JSON.parse(raw) as Workflow[]) : [];
      const next = [{ ...flow, cloudId }, ...local.filter((w) => w.id !== flow.id)];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
    navigate({ to: "/" });
  };

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error) return <p className="text-sm text-destructive">Couldn't load your automations. <button onClick={() => q.refetch()} className="underline">Try again</button></p>;
  const rows = q.data ?? [];
  const visibleRows = rows.filter((automation) => {
    const matchesQuery = `${automation.name} ${automation.status}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesStatus = statusFilter === "all" || automation.status === statusFilter;
    return matchesQuery && matchesStatus;
  });
  if (!rows.length)
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center">
        <p className="font-display text-lg">No saved automations yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Describe what you want in the studio, then press “Save to cloud”.</p>
        <Link to="/" className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">Open the studio</Link>
      </div>
    );

  const conflicts = detectConflicts(rows.map((a) => ({ name: a.name, flow: a.flow, status: a.status })));
  return (
    <>
    {conflicts.length > 0 && (
      <div className="mb-4 space-y-1 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <p className="font-medium">Possible conflicts between your flows</p>
        {conflicts.map((c) => (
          <p key={c.tool} className="text-xs text-muted-foreground"><span className="text-foreground">{c.flows.join(" + ")}</span> — {c.detail}</p>
        ))}
      </div>
    )}
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input
        aria-label="Search automations"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search automations…"
        className="min-w-48 flex-1 rounded-lg border border-input bg-surface-raised px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
      />
      <select
        aria-label="Filter automations by status"
        value={statusFilter}
        onChange={(event) => setStatusFilter(event.target.value)}
        className="rounded-lg border border-input bg-surface-raised px-3 py-2 text-sm outline-none focus:border-primary"
      >
        <option value="all">All statuses</option>
        <option value="draft">Draft</option>
        <option value="live">Live</option>
        <option value="paused">Paused</option>
      </select>
      <span className="text-xs text-muted-foreground">{visibleRows.length} of {rows.length} automations</span>
    </div>
    {visibleRows.length === 0 ? (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <p className="font-medium">No automations match these filters</p>
        <p className="mt-1 text-sm text-muted-foreground">Try another name or choose a different status.</p>
        <button onClick={() => { setQuery(""); setStatusFilter("all"); }} className="mt-3 rounded-lg border border-border px-3 py-1.5 text-sm hover:border-primary/60">Clear filters</button>
      </div>
    ) : (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {visibleRows.map((a) => (
        <div key={a.id} className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium">{a.name}</p>
              <p className="mono-label">v{a.version} · {a.status} · {a.flow?.nodes.length ?? 0} steps</p>
            </div>
            <span className={cn("rounded-md border border-border px-2 py-0.5 text-xs font-semibold", healthTone(a.healthScore))}>{a.healthScore}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Updated {new Date(a.updatedAt).toLocaleString()}{a.lastRunAt ? ` · last run ${new Date(a.lastRunAt).toLocaleString()}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {a.flow && <button onClick={() => openInStudio(a.flow!, a.id)} className="rounded-md bg-primary px-2 py-1 text-primary-foreground">Open</button>}
            <button onClick={async () => { await status({ data: { automationId: a.id, status: a.status === "live" ? "paused" : "live" } }); refresh(); }}
              className="rounded-md border border-border px-2 py-1">{a.status === "live" ? "Pause" : "Go live"}</button>
            <button onClick={async () => { await share({ data: { automationId: a.id, published: true } }); alert(`“${a.name}” is now in the community gallery (steps only — no accounts or settings).`); }}
              className="rounded-md border border-border px-2 py-1">Share to gallery</button>
            <button onClick={() => setOpenId(openId === a.id ? null : a.id)} className="rounded-md border border-border px-2 py-1">History</button>
            <button onClick={async () => { if (confirm(`Delete “${a.name}”?`)) { await del({ data: { automationId: a.id } }); refresh(); } }}
              className="rounded-md border border-border px-2 py-1 text-destructive">Delete</button>
          </div>
          {openId === a.id && <Versions automationId={a.id} onRestored={refresh} />}
        </div>
      ))}
    </div>
    )}
    </>
  );
}

function Versions({ automationId, onRestored }: { automationId: string; onRestored: () => void }) {
  const list = useServerFn(listVersions);
  const restore = useServerFn(restoreVersion);
  const q = useQuery({ queryKey: ["versions", automationId], queryFn: () => list({ data: { automationId } }) });
  const m = useMutation({
    mutationFn: (versionNumber: number) => restore({ data: { automationId, versionNumber } }),
    onSuccess: () => { q.refetch(); onRestored(); },
  });
  return (
    <ul className="mt-3 max-h-48 space-y-1 overflow-auto border-t border-border pt-2 text-xs">
      {(q.data ?? []).map((v, i) => (
        <li key={v.id} className="flex items-center justify-between gap-2">
          <span>v{v.versionNumber} · {v.changeSummary ?? "Saved"} · {new Date(v.createdAt).toLocaleDateString()}</span>
          {i > 0 && <button disabled={m.isPending} onClick={() => m.mutate(v.versionNumber)} className="text-primary">Roll back</button>}
        </li>
      ))}
    </ul>
  );
}

function Runs() {
  const list = useServerFn(listRuns);
  const q = useQuery({ queryKey: ["runs"], queryFn: () => list() });
  const [open, setOpen] = useState<string | null>(null);
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const rows = q.data ?? [];
  if (!rows.length) return <p className="text-sm text-muted-foreground">No runs yet. Save a flow, then press Run in the studio — each run is recorded here with every step.</p>;
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="rounded-xl border border-border bg-surface p-3">
          <button onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full items-center justify-between text-left text-sm">
            <span>
              <span className={cn("mr-2 font-semibold", r.status === "failed" ? "text-destructive" : "text-primary")}>{r.status}</span>
              {r.triggerType} {r.isDryRun && "· dry run"}
            </span>
            <span className="mono-label">{new Date(r.startedAt).toLocaleString()} · {r.durationMs ?? 0}ms</span>
          </button>
          {r.errorSummary && <p className="mt-1 text-xs text-destructive">{r.errorSummary}</p>}
          {r.steps.some((step) => step.outcomeState === "uncertain") && (
            <p role="alert" className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-foreground">
              One or more steps have an uncertain external outcome. Check the destination/provider activity before manually running this flow again. AutoStudio will not automatically replay these steps.
            </p>
          )}
          {(r.status === "failed" || r.status === "halted") && <ExplainFailure runId={r.id} />}
          {open === r.id && (
            <ol className="mt-2 space-y-2 border-t border-border pt-2 text-xs">
              {r.steps.map((s) => (
                <li key={s.id} className="rounded-md border border-border/70 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.label ?? "Unnamed step"}</span>
                    <span className="text-muted-foreground">— {s.status} ({s.durationMs ?? 0}ms)</span>
                    <span className={cn(
                      "rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      s.outcomeState === "uncertain"
                        ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        : s.outcomeState === "confirmed"
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground",
                    )}>
                      {s.outcomeState === "uncertain" ? "Verify before retry" : s.outcomeState === "confirmed" ? "Confirmed" : "Not attempted"}
                    </span>
                  </div>
                  {s.errorDetail && <p className="mt-1 text-muted-foreground">{s.errorDetail}</p>}
                  {s.outcomeState === "uncertain" && (
                    <p className="mt-1 text-amber-700 dark:text-amber-300">Operator action: inspect the external service's activity/logs and confirm whether the action happened. Only rerun after checking to avoid duplicate sends or writes.</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </div>
  );
}

function ExplainFailure({ runId }: { runId: string }) {
  const explain = useServerFn(explainFailure);
  const m = useMutation({ mutationFn: () => explain({ data: { runId } }) });
  return (
    <div className="mt-2 text-xs">
      {m.data ? (
        <p className="rounded-lg border border-border bg-surface-raised p-2">{m.data.explanation}</p>
      ) : (
        <button disabled={m.isPending} onClick={() => m.mutate()} className="rounded-md border border-primary/60 px-2 py-1 text-primary">
          {m.isPending ? "Looking into it…" : "Explain this failure"}
        </button>
      )}
      {m.error && <p className="mt-1 text-destructive">Couldn't explain this run. Try again.</p>}
    </div>
  );
}

function Integrations() {
  const list = useServerFn(listIntegrations);
  const verify = useServerFn(verifyIntegration);
  const disc = useServerFn(disconnectIntegration);
  const q = useQuery({ queryKey: ["integrations"], queryFn: () => list() });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const rows = q.data ?? [];
  if (!rows.length) return <p className="text-sm text-muted-foreground">No apps connected yet. Open a flow's Accounts tab in the studio to connect the apps it needs.</p>;
  const STALE = 6 * 3600_000;
  const stale = rows.filter((i) => i.status !== "connected" || !i.lastVerifiedAt || Date.now() - new Date(i.lastVerifiedAt).getTime() > STALE);
  return (
    <div className="space-y-3">
    {stale.length > 0 && (
      <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm">
        {stale.length} connection{stale.length === 1 ? "" : "s"} haven't been checked in 6+ hours ({stale.map((i) => i.provider).join(", ")}). Check them now so scheduled flows don't fail silently.
        <button onClick={async () => { for (const i of stale) await verify({ data: { integrationId: i.id } }); q.refetch(); }} className="ml-2 rounded-md border border-border px-2 py-0.5 text-xs">Check all now</button>
      </div>
    )}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((i) => (
        <div key={i.id} className="rounded-xl border border-border bg-surface p-4">
          <p className="font-medium">{i.provider}</p>
          <p className="mono-label">
            {i.status === "connected" ? "Connected" : i.status} · verified {i.lastVerifiedAt ? new Date(i.lastVerifiedAt).toLocaleString() : "never"}
          </p>
          {i.scopes.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Permissions: {i.scopes.join(", ")}</p>}
          <div className="mt-3 flex gap-2 text-xs">
            <button onClick={async () => { await verify({ data: { integrationId: i.id } }); q.refetch(); }} className="rounded-md border border-border px-2 py-1">Test connection</button>
            <button onClick={async () => { const r = await disc({ data: { integrationId: i.id } }); if (r.paused.length) alert(`Paused because they use ${i.provider}: ${r.paused.join(", ")}. Reconnect ${i.provider} and press "Go live" to resume.`); q.refetch(); }} className="rounded-md border border-border px-2 py-1 text-destructive">Disconnect</button>
          </div>
        </div>
      ))}
    </div>
    </div>
  );
}
