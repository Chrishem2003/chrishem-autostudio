import { useCallback, useEffect, useRef, useState } from "react";
import { NODES } from "@/lib/automation-catalog";
import type { Workflow } from "@/lib/workflow";
import { KIND_STYLE } from "./kind-styles";
import { cn } from "@/lib/utils";

const NODE_W = 236;
const NODE_H = 112;
const GRID = 8;
const CANVAS_W = 4200;
const CANVAS_H = 2800;

interface Props {
  workflow: Workflow;
  selectedId: string | null;
  runningId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onConnect: (from: string, to: string) => void;
  onDelete: (id: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onDuplicate: (id: string) => void;
  onDropNode: (defId: string, x: number, y: number) => void;
  onTidy: () => void;
}

type Pt = { x: number; y: number };

export function Canvas({
  workflow,
  selectedId,
  runningId,
  onSelect,
  onMove,
  onConnect,
  onDelete,
  onDeleteEdge,
  onDuplicate,
  onDropNode,
  onTidy,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);

  const toLocal = useCallback(
    (clientX: number, clientY: number): Pt => {
      const box = wrapRef.current?.getBoundingClientRect();
      return {
        x: (clientX - (box?.left ?? 0) - view.tx) / view.scale,
        y: (clientY - (box?.top ?? 0) - view.ty) / view.scale,
      };
    },
    [view],
  );

  const nodeAt = useCallback(
    (p: Pt) =>
      workflow.nodes.find((n) => p.x >= n.x && p.x <= n.x + NODE_W && p.y >= n.y && p.y <= n.y + NODE_H) ?? null,
    [workflow.nodes],
  );

  const zoomBy = (factor: number, center?: Pt) => {
    setView((v) => {
      const scale = Math.min(1.8, Math.max(0.35, v.scale * factor));
      const box = wrapRef.current?.getBoundingClientRect();
      const cx = center?.x ?? (box ? box.width / 2 : 0);
      const cy = center?.y ?? (box ? box.height / 2 : 0);
      const k = scale / v.scale;
      return { scale, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k };
    });
  };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const box = el.getBoundingClientRect();
      zoomBy(e.deltaY < 0 ? 1.08 : 0.93, { x: e.clientX - box.left, y: e.clientY - box.top });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLinkFrom(null);
        setCursor(null);
      }
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if ((e.key === "Backspace" || e.key === "Delete") && selectedId) {
        e.preventDefault();
        onDelete(selectedId);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d" && selectedId) {
        e.preventDefault();
        onDuplicate(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, onDelete, onDuplicate]);

  const handlePointerMove = (e: React.PointerEvent) => {
    const p = toLocal(e.clientX, e.clientY);
    if (linkFrom) {
      setCursor(p);
      const target = nodeAt(p);
      setHoverNode(target && target.id !== linkFrom ? target.id : null);
    }
    const drag = dragRef.current;
    if (drag) {
      const x = Math.round(Math.max(8, p.x - drag.dx) / GRID) * GRID;
      const y = Math.round(Math.max(8, p.y - drag.dy) / GRID) * GRID;
      onMove(drag.id, x, y);
      return;
    }
    const pan = panRef.current;
    if (pan) {
      setView((v) => ({ ...v, tx: pan.tx + (e.clientX - pan.x), ty: pan.ty + (e.clientY - pan.y) }));
    }
  };

  const endInteraction = (e: React.PointerEvent) => {
    if (linkFrom) {
      const target = nodeAt(toLocal(e.clientX, e.clientY));
      if (target && target.id !== linkFrom) onConnect(linkFrom, target.id);
      setLinkFrom(null);
      setCursor(null);
      setHoverNode(null);
    }
    dragRef.current = null;
    panRef.current = null;
  };

  const anchor = (id: string, side: "out" | "in"): Pt => {
    const n = workflow.nodes.find((x) => x.id === id);
    if (!n) return { x: 0, y: 0 };
    return { x: n.x + (side === "out" ? NODE_W : 0), y: n.y + NODE_H / 2 };
  };

  const path = (a: Pt, b: Pt) => {
    const d = Math.max(60, Math.abs(b.x - a.x) * 0.5);
    return `M ${a.x} ${a.y} C ${a.x + d} ${a.y}, ${b.x - d} ${b.y}, ${b.x} ${b.y}`;
  };

  const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  return (
    <div
      ref={wrapRef}
      className={cn("studio-grid relative h-full w-full overflow-hidden", linkFrom && "cursor-crosshair")}
      onPointerMove={handlePointerMove}
      onPointerUp={endInteraction}
      onPointerLeave={endInteraction}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("[data-node]")) return;
        onSelect(null);
        panRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
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
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
        }}
      >
        <svg className="absolute inset-0 h-full w-full" style={{ overflow: "visible" }}>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
            </marker>
          </defs>
          {workflow.edges.map((e) => {
            const a = anchor(e.from, "out");
            const b = anchor(e.to, "in");
            const kind = NODES[workflow.nodes.find((n) => n.id === e.from)?.defId ?? ""]?.kind ?? "action";
            const stroke = KIND_STYLE[kind].stroke;
            const hovered = hoverEdge === e.id;
            const m = mid(a, b);
            return (
              <g key={e.id} color={stroke} onPointerEnter={() => setHoverEdge(e.id)} onPointerLeave={() => setHoverEdge(null)}>
                <path d={path(a, b)} fill="none" stroke="transparent" strokeWidth={18} className="cursor-pointer" />
                <path
                  d={path(a, b)}
                  fill="none"
                  strokeWidth={hovered ? 3 : 2}
                  stroke={stroke}
                  opacity={hovered ? 1 : 0.75}
                  markerEnd="url(#arrow)"
                  className={workflow.live ? "edge-live" : undefined}
                  style={{ pointerEvents: "none" }}
                />
                {hovered ? (
                  <g className="cursor-pointer" onPointerDown={(ev) => ev.stopPropagation()} onClick={() => onDeleteEdge(e.id)}>
                    <circle cx={m.x} cy={m.y} r={10} fill="var(--card)" stroke={stroke} strokeWidth={1.5} />
                    <path
                      d={`M ${m.x - 3.5} ${m.y - 3.5} L ${m.x + 3.5} ${m.y + 3.5} M ${m.x + 3.5} ${m.y - 3.5} L ${m.x - 3.5} ${m.y + 3.5}`}
                      stroke={stroke}
                      strokeWidth={1.8}
                      strokeLinecap="round"
                    />
                  </g>
                ) : null}
              </g>
            );
          })}
          {linkFrom && cursor ? (
            <path
              d={path(anchor(linkFrom, "out"), cursor)}
              fill="none"
              strokeWidth={2.5}
              strokeDasharray="6 6"
              stroke="var(--primary)"
              style={{ pointerEvents: "none" }}
            />
          ) : null}
        </svg>

        {workflow.nodes.map((n) => {
          const def = NODES[n.defId];
          if (!def) return null;
          const style = KIND_STYLE[def.kind];
          const selected = selectedId === n.id;
          const missing = def.fields.some((f) => !n.config[f.key]?.trim());
          const isTarget = hoverNode === n.id;
          return (
            <div
              key={n.id}
              data-node
              style={{ left: n.x, top: n.y, width: NODE_W }}
              className={cn(
                "group absolute rounded-xl border bg-card/95 backdrop-blur transition-all",
                selected ? "border-primary glow-primary" : "border-border hover:border-muted-foreground/60",
                isTarget && "border-primary ring-2 ring-primary/40",
                runningId === n.id && "glow-primary scale-[1.02]",
              )}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(n.id);
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                if ((e.target as HTMLElement).closest("[data-handle]")) return;
                onSelect(n.id);
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
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    aria-label={`Duplicate ${n.name}`}
                    title="Duplicate (⌘D)"
                    className="rounded-md px-1 text-xs text-muted-foreground transition-colors hover:text-primary"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicate(n.id);
                    }}
                  >
                    ⧉
                  </button>
                  <button
                    aria-label={`Delete ${n.name}`}
                    title="Delete (⌫)"
                    className="rounded-md px-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(n.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
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
                  className={cn(
                    "absolute -left-1.5 top-1/2 size-3 -translate-y-1/2 rounded-full border-2 bg-surface-raised transition-colors",
                    isTarget ? "border-primary" : "border-border",
                  )}
                />
              ) : null}
              <button
                data-handle
                aria-label={`Drag to connect from ${n.name}`}
                title="Drag to the next step"
                className={cn(
                  "absolute -right-2.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full border-2 text-[9px] transition-all",
                  linkFrom === n.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface-raised text-muted-foreground hover:border-primary hover:text-primary",
                )}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setLinkFrom(n.id);
                  setCursor(toLocal(e.clientX, e.clientY));
                }}
                onClick={(e) => e.stopPropagation()}
              >
                +
              </button>
            </div>
          );
        })}
      </div>

      <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-xl border border-border bg-card/90 p-1 backdrop-blur">
        <button
          onClick={() => zoomBy(0.9)}
          aria-label="Zoom out"
          className="size-7 rounded-lg text-sm text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
        >
          −
        </button>
        <span className="w-10 text-center text-[11px] tabular-nums text-muted-foreground">
          {Math.round(view.scale * 100)}%
        </span>
        <button
          onClick={() => zoomBy(1.1)}
          aria-label="Zoom in"
          className="size-7 rounded-lg text-sm text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
        >
          +
        </button>
        <span className="mx-1 h-5 w-px bg-border" />
        <button
          onClick={() => setView({ scale: 1, tx: 0, ty: 0 })}
          className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
        >
          Reset
        </button>
        <button
          onClick={onTidy}
          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10"
        >
          Tidy up
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg border border-border bg-card/80 px-2.5 py-1.5 text-[11px] text-muted-foreground backdrop-blur">
        {linkFrom ? "Drop on the next step to connect" : "Drag the + handle to connect · drag canvas to pan · ⌘scroll to zoom"}
      </div>
    </div>
  );
}
