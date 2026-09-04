import { useMemo, useState } from "react";
import { KIND_LABEL, KIND_ORDER, NODES, VERTICALS } from "@/lib/automation-catalog";
import { KIND_STYLE } from "./kind-styles";
import { cn } from "@/lib/utils";

interface Props {
  vertical: string;
  onAdd: (defId: string) => void;
}

export function Palette({ vertical, onAdd }: Props) {
  const [query, setQuery] = useState("");
  const v = VERTICALS.find((x) => x.id === vertical) ?? VERTICALS[0]!;

  const q = query.trim().toLowerCase();

  const grouped = useMemo(() => {
    // No query: show this section's curated steps. With a query: search every
    // step across all 180+ apps so nothing is hidden behind the section picker.
    const defs = q
      ? Object.values(NODES)
          .filter((d) => `${d.label} ${d.tool} ${d.summary}`.toLowerCase().includes(q))
          .sort((a, b) => {
            const av = v.nodes.includes(a.id) ? 0 : 1;
            const bv = v.nodes.includes(b.id) ? 0 : 1;
            return av - bv || a.label.localeCompare(b.label);
          })
          .slice(0, 300)
      : v.nodes.map((id) => NODES[id]).filter((d): d is NonNullable<typeof d> => Boolean(d));
    return KIND_ORDER.map((kind) => ({ kind, items: defs.filter((d) => d.kind === kind) })).filter(
      (g) => g.items.length > 0,
    );
  }, [v, q]);

  const total = grouped.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-3">
        <p className="mono-label">Step library</p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search every app — Slack, Stripe, invoice, AI…"
          className="mt-2 w-full rounded-lg border border-input bg-surface-raised px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
        />
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          {q ? `${total} step${total === 1 ? "" : "s"} across all apps` : `${total} steps in ${v.name}`}
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {grouped.map((g) => (
          <div key={g.kind}>
            <p className="mono-label mb-2">{KIND_LABEL[g.kind]}</p>
            <div className="space-y-1.5">
              {g.items.map((d) => (
                <button
                  key={d.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/node-def", d.id)}
                  onClick={() => onAdd(d.id)}
                  className="group w-full cursor-grab rounded-lg border border-border bg-card/60 px-3 py-2 text-left transition-colors hover:border-primary/60 hover:bg-card"
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("size-1.5 rounded-full", KIND_STYLE[d.kind].dot)} />
                    <span className="text-sm font-medium">{d.label}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{d.tool}</span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{d.summary}</p>
                </button>
              ))}
            </div>
          </div>
        ))}
        {grouped.length === 0 ? (
          <p className="px-1 text-sm text-muted-foreground">No steps match “{query}”.</p>
        ) : null}
      </div>
    </div>
  );
}
