import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AUTH_LABEL,
  appForTool,
  loadConnections,
  requiredTools,
  saveConnections,
  suggestAccount,
  type Connection,
} from "@/lib/connections";
import type { Workflow } from "@/lib/workflow";
import { cn } from "@/lib/utils";

interface Props {
  workflow: Workflow | null;
}

export function ConnectionsPanel({ workflow }: Props) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    setConnections(loadConnections());
  }, []);

  const persist = (next: Connection[]) => {
    setConnections(next);
    saveConnections(next);
  };

  const needed = requiredTools(workflow);
  const isConnected = (tool: string) => connections.some((c) => c.tool === tool);
  const missing = needed.filter((t) => !isConnected(t.tool));

  const connect = (tool: string) => {
    setPending(tool);
    // Simulated handshake — the studio ships the consent step; the executor
    // swaps in the real OAuth exchange per app.
    window.setTimeout(() => {
      persist([
        ...connections.filter((c) => c.tool !== tool),
        {
          tool,
          account: suggestAccount(tool),
          auth: appForTool(tool)?.auth ?? "none",
          connectedAt: Date.now(),
        },
      ]);
      setPending(null);
      toast.success(`${tool} connected.`);
    }, 650);
  };

  const connectAll = () => {
    persist([
      ...connections.filter((c) => !missing.some((m) => m.tool === c.tool)),
      ...missing.map((m) => ({
        tool: m.tool,
        account: suggestAccount(m.tool),
        auth: m.auth,
        connectedAt: Date.now(),
      })),
    ]);
    toast.success(`Connected ${missing.length} account${missing.length === 1 ? "" : "s"} for this flow.`);
  };

  return (
    <div className="space-y-3 p-3">
      <div className="rounded-lg border border-border bg-card/60 p-2.5">
        <p className="mono-label">Accounts this flow needs</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {needed.length === 0
            ? "No external accounts required yet — add an app step and it shows up here."
            : missing.length === 0
              ? "Every account is authorised. This flow can go live."
              : `${missing.length} of ${needed.length} account${needed.length === 1 ? "" : "s"} still need authorising.`}
        </p>
        {missing.length > 1 ? (
          <button
            onClick={connectAll}
            className="mt-2 w-full rounded-md border border-primary/60 bg-primary/10 px-2 py-1.5 text-[11px] font-semibold text-primary"
          >
            Connect all {missing.length} accounts
          </button>
        ) : null}
      </div>

      <div className="space-y-1.5">
        {needed.map((t) => {
          const conn = connections.find((c) => c.tool === t.tool);
          return (
            <div
              key={t.tool}
              className={cn(
                "rounded-lg border bg-card/50 px-3 py-2",
                conn ? "border-action/50" : "border-border",
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn("size-1.5 rounded-full", conn ? "bg-action" : "bg-muted-foreground")} />
                <span className="text-sm font-medium">{t.tool}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {t.steps} step{t.steps === 1 ? "" : "s"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {conn ? `Connected as ${conn.account}` : AUTH_LABEL[t.auth]}
              </p>
              <button
                onClick={() => (conn ? persist(connections.filter((c) => c.tool !== t.tool)) : connect(t.tool))}
                disabled={pending === t.tool}
                className={cn(
                  "mt-2 w-full rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-60",
                  conn
                    ? "border-border text-muted-foreground hover:text-destructive"
                    : "border-primary/60 text-primary hover:bg-primary/10",
                )}
              >
                {pending === t.tool ? "Authorising…" : conn ? "Disconnect" : `Connect ${t.tool}`}
              </button>
            </div>
          );
        })}
      </div>

      {connections.length ? (
        <div className="rounded-lg border border-border bg-surface-raised p-2.5">
          <p className="mono-label">Workspace connections</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {connections.length} account{connections.length === 1 ? "" : "s"} authorised and reusable across every flow.
          </p>
        </div>
      ) : null}
    </div>
  );
}
