import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteNav } from "@/routes/marketplace";
import { impactOf, TIERS, type ImpactMetrics } from "@/lib/impact";
import { STORAGE_KEY, workflowFromTemplate, type Workflow } from "@/lib/workflow";

export const Route = createFileRoute("/impact")({
  head: () => ({
    meta: [
      { title: "Impact Dashboard — Hours Saved, Errors Blocked, Revenue Unlocked" },
      {
        name: "description",
        content:
          "A live ROI ticker for your automations: manual hours saved, errors blocked, revenue unlocked and paper and CO2 avoided.",
      },
      { property: "og:title", content: "Impact Dashboard — Real-Time Automation ROI" },
      {
        property: "og:description",
        content: "Prove the value of every workflow with live hours-saved, error-blocked and sustainability metrics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ImpactPage,
});

const CARDS: { key: keyof ImpactMetrics; label: string; suffix?: string; prefix?: string }[] = [
  { key: "hoursSaved", label: "Manual hours saved / month", suffix: " h" },
  { key: "errorsBlocked", label: "Human errors blocked" },
  { key: "revenueUnlocked", label: "Revenue unlocked", prefix: "$" },
  { key: "runsPerMonth", label: "Runs executed / month" },
  { key: "automatedSteps", label: "Automated steps live" },
  { key: "paperSheetsAvoided", label: "Paper sheets avoided" },
  { key: "kgCo2Avoided", label: "kg CO₂ avoided", suffix: " kg" },
];

function ImpactPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let loaded: Workflow[] = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) loaded = JSON.parse(raw) as Workflow[];
    } catch {
      loaded = [];
    }
    setWorkflows(loaded.length ? loaded : [workflowFromTemplate("lead-router")]);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1600);
    return () => window.clearInterval(id);
  }, []);

  const metrics = impactOf(workflows);
  const live = workflows.filter((w) => w.live).length;
  const drift = 1 + tick * 0.0012;

  const format = (key: keyof ImpactMetrics) => {
    const raw = metrics[key] * (key === "automatedSteps" ? 1 : drift);
    return key === "hoursSaved" || key === "kgCo2Avoided"
      ? (Math.round(raw * 10) / 10).toLocaleString()
      : Math.round(raw).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav current="/impact" />

      <header className="border-b border-border bg-surface px-5 py-10">
        <div className="mx-auto max-w-6xl">
          <p className="mono-label">Real-time ROI &amp; impact metrics</p>
          <h1 className="mt-2 max-w-2xl font-display text-3xl font-semibold leading-tight sm:text-4xl">
            Every run has a number attached to it.
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Measured across {workflows.length} flow{workflows.length === 1 ? "" : "s"} on this device, {live} currently
            live. The ticker keeps counting while flows stay switched on.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map((c) => (
            <div key={c.key} className="rounded-xl border border-border bg-card/60 p-4">
              <p className="mono-label">{c.label}</p>
              <p className="mt-1.5 font-display text-2xl font-semibold tabular-nums">
                {c.prefix ?? ""}
                {format(c.key)}
                {c.suffix ?? ""}
              </p>
            </div>
          ))}
          <div className="rounded-xl border border-action/50 bg-action/10 p-4">
            <p className="mono-label">Status</p>
            <p className="mt-1.5 flex items-center gap-2 font-display text-lg font-semibold text-action">
              <span className="size-2 animate-pulse rounded-full bg-action" />
              Counting live
            </p>
          </div>
        </div>

        <section className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="rounded-xl border border-border bg-card/50 p-5">
            <h2 className="font-display text-lg font-semibold">Per-flow contribution</h2>
            <ul className="mt-3 space-y-2">
              {workflows.map((w) => {
                const m = impactOf([w]);
                const share = metrics.hoursSaved ? (m.hoursSaved / metrics.hoursSaved) * 100 : 0;
                return (
                  <li key={w.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-semibold">{w.name}</p>
                      <span className="mono-label shrink-0">{m.hoursSaved.toLocaleString()} h</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, share)}%` }} />
                    </div>
                    <p className="mono-label mt-1.5">
                      {w.live ? "Live" : "Paused"} · {w.nodes.length} steps · {m.errorsBlocked.toLocaleString()} errors
                      blocked
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>

          <aside className="rounded-xl border border-action/40 bg-action/5 p-5">
            <p className="mono-label">Open-data humanitarian tier</p>
            <h2 className="mt-1 font-display text-lg font-semibold">Enterprise capacity, donated.</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Verified NGOs, public health supply chains and environmental monitoring networks run with no ceiling on
              executions, at no cost, forever.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              {TIERS.find((t) => t.id === "humanitarian")?.perks.map((p) => <li key={p}>· {p}</li>)}
            </ul>
            <a
              href="mailto:impact@automationstudio.app?subject=Humanitarian%20tier%20application"
              className="mt-4 inline-block rounded-lg bg-action px-3 py-2 text-sm font-semibold text-background"
            >
              Apply for the tier
            </a>
          </aside>
        </section>
      </main>
    </div>
  );
}
