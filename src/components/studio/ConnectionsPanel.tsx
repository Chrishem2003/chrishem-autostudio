import { NODES } from "@/lib/automation-catalog";
import { requiredTools } from "@/lib/connections";
import type { Workflow } from "@/lib/workflow";
import { cn } from "@/lib/utils";
import { isChatMessageStep } from "@/lib/chat-steps";
import { GmailConnect } from "./GmailConnect";

interface Props {
  workflow: Workflow | null;
}

function connectionTruth(tool: string, workflow: Workflow | null): { label: string; detail: string; tone: "live" | "configured" | "soon" } {
  if (!workflow) return { label: "Not configured", detail: "Choose a flow to inspect its connection requirements.", tone: "soon" };

  const nodes = workflow.nodes.filter((node) => NODES[node.defId]?.tool === tool);
  if (tool.toLowerCase() === "gmail") {
    return {
      label: "Managed above",
      detail: "Use the Gmail connection card above. Gmail authorization is separate from local workspace labels.",
      tone: "configured",
    };
  }

  const chatNodes = nodes.filter((node) => isChatMessageStep(node.defId, NODES[node.defId]?.tool));
  if (chatNodes.length > 0) {
    const configured = chatNodes.every((node) => Boolean(node.config["webhook"]?.trim()));
    return configured
      ? {
          label: "Webhook configured",
          detail: "A destination URL is present. Delivery is only confirmed after the server receives a successful provider response.",
          tone: "configured",
        }
      : {
          label: "Needs setup",
          detail: "Open each chat step and add its provider webhook URL. A local 'connected' flag is not proof of access.",
          tone: "soon",
        };
  }

  const httpNodes = nodes.filter((node) => node.defId === "action.http" || node.defId === "output.webhook");
  if (httpNodes.length > 0) {
    const configured = httpNodes.every((node) => Boolean(node.config["url"]?.trim()));
    return configured
      ? {
          label: "Destination configured",
          detail: "The URL will be resolved and checked at execution time. Private/local destinations are blocked.",
          tone: "configured",
        }
      : {
          label: "Needs setup",
          detail: "Add a destination URL in the step settings.",
          tone: "soon",
        };
  }

  return {
    label: "Coming soon",
    detail: "This app appears in the catalog, but it has no verified live adapter yet. It cannot be marked connected here.",
    tone: "soon",
  };
}

export function ConnectionsPanel({ workflow }: Props) {
  const needed = requiredTools(workflow);

  return (
    <div className="space-y-3 p-3">
      <GmailConnect />

      <div className="rounded-lg border border-border bg-card/60 p-2.5">
        <p className="mono-label">Connection truth</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Only provider verification or a successful live response can prove a connection works. Catalog entries and local browser settings do not count as authorization.
        </p>
      </div>

      <div className="space-y-1.5">
        {needed.length === 0 ? (
          <div className="rounded-lg border border-border bg-card/50 px-3 py-3 text-xs text-muted-foreground">
            No external account requirements were detected. Add an action step to see its setup status here.
          </div>
        ) : needed.map((item) => {
          const state = connectionTruth(item.tool, workflow);
          return (
            <div key={item.tool} className="rounded-lg border border-border bg-card/50 px-3 py-2">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 rounded-full",
                    state.tone === "live" ? "bg-action" : state.tone === "configured" ? "bg-amber-500" : "bg-muted-foreground",
                  )}
                />
                <span className="text-sm font-medium">{item.tool}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {item.steps} step{item.steps === 1 ? "" : "s"}
                </span>
              </div>
              <p className="mt-1 text-xs font-medium">{state.label}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{state.detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
