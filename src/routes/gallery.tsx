import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { listGallery, type GalleryFlow } from "@/lib/gallery.functions";
import { STORAGE_KEY, uid, type Workflow } from "@/lib/workflow";
import { NODES } from "@/lib/automation-catalog";
import { loadConnections } from "@/lib/connections";
import { SiteNav } from "./marketplace";

const galleryQuery = queryOptions({ queryKey: ["gallery"], queryFn: () => listGallery() });

export const Route = createFileRoute("/gallery")({
  head: () => ({
    meta: [
      { title: "Community Gallery — Chrishem AutoStudio" },
      { name: "description", content: "Browse automations shared by the community and remix them onto your own apps in one click." },
      { property: "og:title", content: "Community Gallery — Chrishem AutoStudio" },
      { property: "og:description", content: "Browse shared automations and remix them in one click." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(galleryQuery),
  errorComponent: () => <p className="p-8 text-sm text-muted-foreground">The gallery couldn't load. Refresh to try again.</p>,
  notFoundComponent: () => <p className="p-8 text-sm">Not found.</p>,
  component: Gallery,
});

function toolsOf(f: GalleryFlow) {
  return [...new Set(f.nodes.map((n) => NODES[n.defId]?.tool).filter((t): t is string => !!t && t !== "Core"))];
}

function Gallery() {
  const { data } = useSuspenseQuery(galleryQuery);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [connected, setConnected] = useState<string[]>([]);
  useEffect(() => setConnected(loadConnections().map((c) => c.tool)), []);

  const remix = (f: GalleryFlow) => {
    const wf: Workflow = {
      id: uid("wf"),
      name: `${f.name} (remix)`,
      vertical: f.vertical ?? "general",
      live: false,
      updatedAt: Date.now(),
      nodes: f.nodes.map((n) => ({ ...n, config: {} })),
      edges: f.edges,
    };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const local = raw ? (JSON.parse(raw) as Workflow[]) : [];
      localStorage.setItem(STORAGE_KEY, JSON.stringify([wf, ...local]));
    } catch { /* ignore */ }
    navigate({ to: "/" });
  };

  const rows = data.filter((f) => `${f.name} ${f.description ?? ""} ${toolsOf(f).join(" ")}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav current="/gallery" />
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="font-display text-3xl font-bold">Community gallery</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Flows people chose to share — structure only, never their accounts or settings. Remix one and it lands in your studio, matched to apps you've already connected.
        </p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or app…"
          className="mt-4 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        {rows.length === 0 ? (
          <p className="mt-8 text-sm text-muted-foreground">
            No shared flows yet. Save a flow to the cloud, then press "Share to gallery" in your workspace to be the first.
          </p>
        ) : (
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((f) => {
              const tools = toolsOf(f);
              const missing = tools.filter((t) => !connected.includes(t));
              return (
                <div key={f.id} className="rounded-xl border border-border bg-surface p-4">
                  <p className="font-medium">{f.name}</p>
                  <p className="mono-label">{f.nodes.length} steps · {f.vertical ?? "general"}</p>
                  {f.description && <p className="mt-2 text-xs text-muted-foreground">{f.description}</p>}
                  <p className="mt-2 text-xs">{tools.join(" · ") || "Core steps only"}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {missing.length ? `You'll need to connect: ${missing.join(", ")}` : "All apps already connected"}
                  </p>
                  <button onClick={() => remix(f)} className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                    Remix into my studio
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
