import { AUTH_LABEL, requiredTools } from "@/lib/connections";
import type { Workflow } from "@/lib/workflow";
import { GmailConnect } from "./GmailConnect";

interface Props {
  workflow: Workflow | null;
}

export function ConnectionsPanel({ workflow }: Props) {
  const needed = requiredTools(workflow);

  return (
    <div className="space-y-3 p-3">
      <GmailConnect />
      <div className="rounded-lg border border-border bg-card/60 p-2.5">
        <p className="mono-label">Accounts this flow needs</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {needed.length === 0
            ? "No external accounts required yet — add an app step and its authorization requirements will appear here."
            : "Only provider-specific authorization handshakes can mark an account connected. Generic account placeholders are never treated as authorization."}
        </p>
      </div>

      <div className="space-y-1.5">
        {needed.map((tool) => (
          <div key={tool.tool} className="rounded-lg border border-border bg-card/50 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-muted-foreground" />
              <span className="text-sm font-medium">{tool.tool}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">
                {tool.steps} step{tool.steps === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{AUTH_LABEL[tool.auth]}</p>
            <p className="mt-2 rounded-md border border-border bg-background/60 px-2 py-1.5 text-[11px] text-muted-foreground">
              Authorization is not configured for this provider yet. This account remains unconnected and live execution must not rely on it.
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
