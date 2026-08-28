import { useCallback, useRef, useState } from "react";
import { NODES } from "@/lib/automation-catalog";
import type { Workflow } from "@/lib/workflow";
import { KIND_STYLE } from "./kind-styles";
import { cn } from "@/lib/utils";

const NODE_W = 232;
const NODE_H = 108;

interface Props {
  workflow: Workflow;
  selectedId: string | null;
  runningId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onConnect: (from: string, to: string) => void;
  onDelete: (id: string) => void;
  onDropNode: (defId: string, x: number, y: number) => void;
}

export function Canvas({
  workflow,
  selectedId,
  runningId,
  onSelect,
  onMove,
  onConnect,
  onDelete,
  onDropNode,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const toLocal = useCallback((clientX: number, clientY: number) => {
    const box = wrapRef.current?.getBoundingClientRect();
    return {
      x: clientX - (box?.left ?? 0) + (wrapRef.current?.scrollLeft ?? 0),
      y: clientY - (box?.top ?? 0) + (wrapRef.current?.scrollTop ?? 0),
    };
  }, []);

  const handlePointerMove = (e: React.PointerEvent) => {
    const p = toLocal(e.clientX, e.clientY);
    if (linkFrom) setCursor(p);
    const drag = dragRef.current;
    if (drag) onMove(drag.id, Math.max(8, p.x - drag.dx), Math.max(8, p.y - drag.dy));
  };

  const anchor = (id: string, side: "out" | "in") => {
    const n = workflow.nodes.find((x) => x.id === id);
    if (!n) return { x: 0, y: 0 };
    return { x: n.x + (side === "out" ? NODE_W : 0), y: n.y + NODE_H / 2 };
  };

  const path = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const d = Math.max(48, Math.abs(b.x - a.x) / 2);
    return `M ${a.x} ${a.y} C ${a.x + d} ${a.y}, ${b.x - d} ${b.y}, ${b.x} ${b.y}`;
  };

  return (
    <div
      ref={wrapRef}
      className="studio-grid relative h-full w-full overflow-auto"
      onPointerMove={handlePointerMove}
      onPointerUp={() => {
        dragRef.current = null;
      }}
      onClick={() => {
        onSelect(null);
        setLinkFrom(null);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const defId = e.dataTransfer.getData("text/node-def");
        if (!defId) return;
        const p = toLocal(e.clientX, e.clientY);
        onDropNode(defId, Math.max(8, p.x - NODE_W / 2), Math.max(8, p.y - NODE_H / 2));
      }}
    >
      <div className="relative" style={{ width: 2400, height: 1500 }}>
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {workflow.edges.map((e) => {
            const a = anchor(e.from, "out");
            const b = anchor(e.to, "in");
            const kind = NODES[workflow.nodes.find((n) => n.id === e.from)?.defId ?? ""]?.kind ?? "action";
            return (
              <path
                key={e.id}
                d={path(a, b)}
                fill="none"
                strokeWidth={2}
                stroke={KIND_STYLE[kind].stroke}
                opacity={0.7}
                className={workflow.live ? "edge-live" : undefined}
              />
            );
          })}
          {linkFrom && cursor ? (
            <path
              d={path(anchor(linkFrom, "out"), cursor)}
              fill="none"
              strokeWidth={2}
              strokeDasharray="5 5"
              stroke="var(--primary)"
            />
          ) : null}
        </svg>

        {workflow.nodes.map((n) => {
          const def = NODES[n.defId];
          if (!def) return null;
          const style = KIND_STYLE[def.kind];
          const selected = selectedId === n.id;
          const missing = def.fields.some((f) => !n.config[f.key]?.trim());
          return (
            <div
              key={n.id}
              style={{ left: n.x, top: n.y, width: NODE_W }}
              className={cn(
                "absolute rounded-xl border bg-card/95 backdrop-blur transition-shadow",
                selected ? "border-primary glow-primary" : "border-border hover:border-muted-foreground/50",
                runningId === n.id && "glow-primary",
              )}
              onClick={(e) => {
                e.stopPropagation();
                if (linkFrom && linkFrom !== n.id) {
                  onConnect(linkFrom, n.id);
                  setLinkFrom(null);
                  return;
                }
                onSelect(n.id);
              }}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest("[data-handle]")) return;
                const p = toLocal(e.clientX, e.clientY);
                dragRef.current = { id: n.id, dx: p.x - n.x, dy: p.y - n.y };
              }}
            >
              <div className="flex items-start gap-2 px-3 pt-3">
                <span className={cn("mt-1 size-2 shrink-0 rounded-full", style.dot)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{n.name}</p>
                  <p className="mono-label mt-0.5">{def.tool}</p>
                </div>
                <button
                  aria-label={`Delete ${n.name}`}
                  className="rounded-md px-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(n.id);
                  }}
                >
                  ✕
                </button>
              </div>
              <p className="line-clamp-2 px-3 pb-2 pt-2 text-xs leading-snug text-muted-foreground">{def.summary}</p>
              <div className="flex items-center justify-between border-t border-border/70 px-3 py-1.5">
                <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase", style.chip)}>
                  {def.kind}
                </span>
                {missing ? <span className="text-[10px] text-primary">needs setup</span> : null}
              </div>

              {def.kind !== "trigger" ? (
                <span
                  data-handle
                  className="absolute -left-1.5 top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-border bg-surface-raised"
                />
              ) : null}
              <button
                data-handle
                aria-label={`Connect from ${n.name}`}
                className={cn(
                  "absolute -right-2 top-1/2 size-4 -translate-y-1/2 rounded-full border-2 transition-colors",
                  linkFrom === n.id ? "border-primary bg-primary" : "border-border bg-surface-raised hover:border-primary",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setLinkFrom(linkFrom === n.id ? null : n.id);
                }}
              />
            </div>
          );
        })}
      </div>

      {linkFrom ? (
        <div className="pointer-events-none sticky bottom-4 left-1/2 ml-[-9rem] w-72 rounded-lg border border-primary/50 bg-card/95 px-3 py-2 text-center text-xs text-muted-foreground">
          Now click the step this should flow into.
        </div>
      ) : null}
    </div>
  );
}
