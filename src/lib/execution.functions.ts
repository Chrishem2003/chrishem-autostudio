import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { executeStep, liveCapabilityError, type ExecutionMode } from "@/lib/execute-step.server";
import type { WorkflowNode } from "@/lib/workflow";

const flowShape = z.object({
  name: z.string().min(1).max(200),
  nodes: z.array(z.object({
    id: z.string().min(1).max(120),
    defId: z.string().min(1).max(160),
    x: z.number(),
    y: z.number(),
    name: z.string().min(1).max(200),
    config: z.record(z.string(), z.string()),
  })).max(200),
  edges: z.array(z.object({
    id: z.string().min(1).max(120),
    from: z.string().min(1).max(120),
    to: z.string().min(1).max(120),
  })).max(500),
});

export const executeAutomationStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    automationId: z.string().uuid(),
    nodeId: z.string().min(1).max(120),
    mode: z.enum(["dry", "test", "live"]).default("dry"),
  }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("automations")
      .select("id, name, status, flow_json")
      .eq("id", data.automationId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error("Could not load the saved automation.");
    if (!row) throw new Error("Automation not found.");

    const parsed = flowShape.safeParse(row.flow_json);
    if (!parsed.success) throw new Error("The saved automation is invalid. Open it in the builder and save a corrected version.");
    const node = parsed.data.nodes.find((candidate) => candidate.id === data.nodeId) as WorkflowNode | undefined;
    if (!node) throw new Error("That step is no longer part of the saved automation.");

    const mode: ExecutionMode = data.mode;
    if (mode === "live") {
      if (row.status !== "live") throw new Error("This automation is not live in the cloud. No external action was taken.");
      const reason = liveCapabilityError(node);
      if (reason) throw new Error(reason);
    }

    try {
      return await executeStep({ node, flowName: parsed.data.name || row.name, userId: context.userId, mode });
    } catch (error) {
      // Provider exceptions are intentionally normalized; never return credential-bearing error objects.
      console.error("[AutoStudio] Step execution failed.", {
        automationId: row.id,
        nodeId: node.id,
        mode,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return {
        nodeId: node.id,
        label: node.name.slice(0, 160),
        status: "failed" as const,
        ms: 0,
        detail: "The step failed unexpectedly. Check the connection and run details before retrying.",
      };
    }
  });
