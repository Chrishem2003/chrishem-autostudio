import { useEffect, useMemo, useRef, useState } from "react";
import { NODES, TEMPLATES, VERTICALS } from "@/lib/automation-catalog";
import { KIND_STYLE } from "./kind-styles";
import { cn } from "@/lib/utils";

export interface CommandAction {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  actions: CommandAction[];
  onAddStep: (defId: string) => void;
  onUseTemplate: (templateId: string) => void;
  onSetVertical: (verticalId: string) => void;
}

interface Row {
  key: string;
  group: string;
  label: string;
  hint: string;
  dot?: string;
  run: () => void;
}

const ALL_STEPS = Object.values(NODES);

/**
 * One search box over every command, step, template and industry section.
 * Opens with ⌘K / Ctrl-K so power users never hunt through panels.
 */
export function CommandPalette({ open, onClose, actions, onAddStep, onUseTemplate, onSetVertical }: Props) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      window.setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const match = (s: string) => s.toLowerCase().includes(q);

    const actionRows: Row[] = actions
      .filter((a) => !q || match(a.label))
      .map((a) => ({ key: `a:${a.id}`, group: "Actions", label: a.label, hint: a.hint ?? "", run: a.run }));

    if (!q) return actionRows;

    const stepRows: Row[] = ALL_STEPS.filter((d) => match(d.label) || match(d.tool) || match(d.summary))
      .slice(0, 40)
      .map((d) => ({
        key: `s:${d.id}`,
        group: "Add a step",
        label: d.label,
        hint: `${d.tool} · ${d.kind}`,
        dot: KIND_STYLE[d.kind].dot,
        run: () => onAddStep(d.id),
      }));

    const tplRows: Row[] = TEMPLATES.filter((t) => match(t.name) || match(t.description))
      .slice(0, 12)
      .map((t) => ({
        key: `t:${t.id}`,
        group: "Templates",
        label: t.name,
        hint: `${t.chain.length} steps`,
        run: () => onUseTemplate(t.id),
      }));

    const vertRows: Row[] = VERTICALS.filter((v) => match(v.name))
      .slice(0, 8)
      .map((v) => ({
        key: `v:${v.id}`,
        group: "Industry section",
        label: `${v.glyph} ${v.name}`,
        hint: "switch section",
        run: () => onSetVertical(v.id),
      }));

    return [...actionRows, ...stepRows, ...tplRows, ...vertRows];
  }, [query, actions, onAddStep, onUseTemplate, onSetVertical]);

  if (!open) return null;

  const pick = (row: Row | undefined) => {
    if (!row) return;
    row.run();
    onClose();
  };

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 p-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, rows.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            }
            if (e.key === "Enter") {
              e.preventDefault();
              pick(rows[cursor]);
            }
          }}
          placeholder="Search steps, apps, templates or run a command…"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none"
        />
        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          {rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing matches “{query}”.</p>
          ) : (
            rows.map((row, i) => {
              const header = row.group !== lastGroup ? row.group : null;
              lastGroup = row.group;
              return (
                <div key={row.key}>
                  {header ? <p className="mono-label px-2.5 pb-1 pt-2">{header}</p> : null}
                  <button
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => pick(row)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                      i === cursor ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-surface-raised",
                    )}
                  >
                    {row.dot ? <span className={cn("size-1.5 shrink-0 rounded-full", row.dot)} /> : null}
                    <span className="truncate font-medium text-foreground">{row.label}</span>
                    <span className="ml-auto shrink-0 truncate text-[11px] text-muted-foreground">{row.hint}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
        <p className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
          ↑↓ to move · ⏎ to pick · esc to close
        </p>
      </div>
    </div>
  );
}
