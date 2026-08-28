import { NODES } from "@/lib/automation-catalog";
import type { Workflow, WorkflowNode } from "@/lib/workflow";
import { KIND_STYLE } from "./kind-styles";
import { cn } from "@/lib/utils";

interface Props {
  workflow: Workflow;
  node: WorkflowNode | null;
  onRename: (id: string, name: string) => void;
  onConfig: (id: string, key: string, value: string) => void;
  onDisconnect: (edgeId: string) => void;
}

export function Inspector({ workflow, node, onRename, onConfig, onDisconnect }: Props) {
  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="mono-label">Inspector</p>
        <p className="max-w-[15rem] text-sm text-muted-foreground">
          Select a step on the canvas to configure what it does and where its data goes.
        </p>
      </div>
    );
  }

  const def = NODES[node.defId]!;
  const incoming = workflow.edges.filter((e) => e.to === node.id);
  const outgoing = workflow.edges.filter((e) => e.from === node.id);
  const nameOf = (id: string) => workflow.nodes.find((n) => n.id === id)?.name ?? "unknown";

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-2">
          <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase", KIND_STYLE[def.kind].chip)}>
            {def.kind}
          </span>
          <span className="mono-label">{def.tool}</span>
        </div>
        <input
          value={node.name}
          onChange={(e) => onRename(node.id, e.target.value)}
          className="mt-3 w-full rounded-lg border border-input bg-surface-raised px-3 py-2 font-display text-sm outline-none focus:border-primary"
        />
        <p className="mt-2 text-xs text-muted-foreground">{def.summary}</p>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {def.fields.map((f) => (
          <div key={f.key}>
            <label className="mono-label" htmlFor={`${node.id}-${f.key}`}>
              {f.label}
            </label>
            {f.type === "textarea" ? (
              <textarea
                id={`${node.id}-${f.key}`}
                rows={3}
                value={node.config[f.key] ?? ""}
                placeholder={f.placeholder}
                onChange={(e) => onConfig(node.id, f.key, e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-input bg-surface-raised px-3 py-2 font-mono text-xs outline-none focus:border-primary"
              />
            ) : f.type === "select" ? (
              <select
                id={`${node.id}-${f.key}`}
                value={node.config[f.key] ?? ""}
                onChange={(e) => onConfig(node.id, f.key, e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-input bg-surface-raised px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">Choose…</option>
                {f.options?.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`${node.id}-${f.key}`}
                value={node.config[f.key] ?? ""}
                placeholder={f.placeholder}
                onChange={(e) => onConfig(node.id, f.key, e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-input bg-surface-raised px-3 py-2 text-sm outline-none focus:border-primary"
              />
            )}
          </div>
        ))}

        <div className="space-y-2 border-t border-border pt-4">
          <p className="mono-label">Connections</p>
          {incoming.length === 0 && outgoing.length === 0 ? (
            <p className="text-xs text-muted-foreground">Not linked yet. Use the round handle on a step to draw a link.</p>
          ) : null}
          {incoming.map((e) => (
            <ConnRow key={e.id} label={`from ${nameOf(e.from)}`} onRemove={() => onDisconnect(e.id)} />
          ))}
          {outgoing.map((e) => (
            <ConnRow key={e.id} label={`to ${nameOf(e.to)}`} onRemove={() => onDisconnect(e.id)} />
          ))}
        </div>

        <div className="rounded-lg border border-border bg-surface-raised p-3">
          <p className="mono-label">Data available here</p>
          <p className="mt-1.5 font-mono text-xs leading-relaxed text-muted-foreground">
            {"{{trigger.payload}}"}
            <br />
            {incoming.map((e) => `{{${nameOf(e.from).toLowerCase().replace(/\s+/g, "_")}.output}}`).join("\n") ||
              "{{previous.output}}"}
          </p>
        </div>
      </div>
    </div>
  );
}

function ConnRow({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-card/60 px-2.5 py-1.5 text-xs">
      <span className="truncate text-muted-foreground">{label}</span>
      <button onClick={onRemove} className="text-muted-foreground transition-colors hover:text-destructive">
        remove
      </button>
    </div>
  );
}
