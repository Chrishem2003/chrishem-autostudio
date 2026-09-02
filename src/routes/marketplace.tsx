import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { PACKS, TIERS } from "@/lib/impact";
import { VERTICALS } from "@/lib/automation-catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/marketplace")({
  head: () => ({
    meta: [
      { title: "Automation Marketplace — Monetizable Workflow Packs" },
      {
        name: "description",
        content:
          "Deploy creator-built multi-app automation packs in one click, or publish your own pipelines as subscription products.",
      },
      { property: "og:title", content: "Automation Marketplace — Monetizable Workflow Packs" },
      {
        property: "og:description",
        content: "Creator-built automation packs for sales, finance, support, health and logistics teams.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MarketplacePage,
});

function MarketplacePage() {
  const [query, setQuery] = useState("");
  const [vertical, setVertical] = useState("all");

  const packs = useMemo(
    () =>
      PACKS.filter((p) => (vertical === "all" || p.vertical === vertical))
        .filter((p) =>
          query.trim()
            ? `${p.name} ${p.summary} ${p.tags.join(" ")} ${p.creator}`.toLowerCase().includes(query.toLowerCase())
            : true,
        )
        .sort((a, b) => b.installs - a.installs),
    [query, vertical],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster />
      <SiteNav current="/marketplace" />

      <header className="border-b border-border bg-surface px-5 py-10">
        <div className="mx-auto max-w-6xl">
          <p className="mono-label">Micro-SaaS workflow marketplace</p>
          <h1 className="mt-2 max-w-2xl font-display text-3xl font-semibold leading-tight sm:text-4xl">
            Buy a pipeline that already works. Or sell the one you perfected.
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Every pack installs onto your canvas as real, editable steps — no black boxes. Creators keep 80% of
            recurring revenue, billed through Stripe.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search packs, creators, tags…"
              className="min-w-56 flex-1 rounded-lg border border-input bg-surface-raised px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <select
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
              className="rounded-lg border border-input bg-surface-raised px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="all">All sections</option>
              {VERTICALS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.glyph} {v.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {packs.map((p) => (
            <article
              key={p.id}
              className="flex flex-col rounded-xl border border-border bg-card/60 p-4 transition-colors hover:border-primary/60"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-semibold">{p.name}</h2>
                  <p className="mono-label mt-0.5">
                    {p.creator} · {VERTICALS.find((v) => v.id === p.vertical)?.name ?? p.vertical}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                    p.price === 0 ? "border-action/60 bg-action/15 text-action" : "border-border text-muted-foreground",
                  )}
                >
                  {p.price === 0 ? "Free" : `$${p.price}/${p.billing === "monthly" ? "mo" : "once"}`}
                </span>
              </div>

              <p className="mt-3 text-sm text-muted-foreground">{p.summary}</p>

              <ul className="mt-3 flex flex-wrap gap-1.5">
                {p.tags.map((t) => (
                  <li key={t} className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {t}
                  </li>
                ))}
              </ul>

              <p className="mono-label mt-3">
                {p.chain.length} steps · {p.installs.toLocaleString()} installs · ★ {p.rating}
              </p>

              <div className="mt-4 flex items-center gap-2">
                <Link
                  to="/"
                  className="flex-1 rounded-lg bg-primary px-3 py-2 text-center text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Install to canvas
                </Link>
                <button
                  onClick={() =>
                    toast.message("Stripe checkout not connected yet", {
                      description: "Enable payments and this button charges for the pack, then unlocks it per account.",
                    })
                  }
                  className="rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:border-primary/60"
                >
                  {p.price === 0 ? "Details" : "Subscribe"}
                </button>
              </div>
            </article>
          ))}
        </div>

        {packs.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">No packs match that search yet.</p>
        ) : null}

        <section className="mt-12">
          <h2 className="font-display text-xl font-semibold">Plans</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {TIERS.map((t) => (
              <div
                key={t.id}
                className={cn(
                  "rounded-xl border p-4",
                  t.highlight ? "border-primary/70 bg-primary/5" : "border-border bg-card/50",
                )}
              >
                <p className="mono-label">{t.name}</p>
                <p className="mt-1 font-display text-2xl font-semibold">{t.price}</p>
                <p className="text-xs text-muted-foreground">{t.runs}</p>
                <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                  {t.perks.map((perk) => (
                    <li key={perk}>· {perk}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export function SiteNav({ current }: { current: string }) {
  const links = [
    { to: "/" as const, label: "Studio" },
    { to: "/marketplace" as const, label: "Marketplace" },
    { to: "/impact" as const, label: "Impact" },
    { to: "/sdk" as const, label: "Embed SDK" },
  ];
  return (
    <nav className="flex items-center gap-4 border-b border-border bg-surface px-5 py-3 text-sm">
      <span className="grid size-7 place-items-center rounded-md bg-primary font-display text-sm font-bold text-primary-foreground">
        A
      </span>
      {links.map((l) => (
        <Link
          key={l.to}
          to={l.to}
          className={cn(
            "transition-colors",
            current === l.to ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
