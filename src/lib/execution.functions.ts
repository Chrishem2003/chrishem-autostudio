import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { executeStep, type ExecutionMode } from "@/lib/execute-step.server";
import type { WorkflowNode } from "@/lib/workflow";
import { planLinearExecution } from "@/lib/execution-plan";
import { classifyExecutionOutcome } from "@/lib/execution-outcome";

const MAX_FLOW_RUNTIME_MS = 4 * 60 * 1000;

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

    if (data.mode === "live") {
      throw new Error("Direct single-step live execution is disabled. Run the entire saved flow through the server-side flow executor.");
    }
    const mode: ExecutionMode = data.mode;

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

/**
 * Executes a complete saved flow in one authenticated server request.
 * The browser can no longer orchestrate live side effects by calling individual
 * step endpoints in arbitrary order and then fabricate a successful run record.
 */
export const executeAutomationFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    automationId: z.string().uuid(),
    mode: z.enum(["dry", "live"]).default("dry"),
  }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("automations")
      .select("id, user_id, name, status, flow_json, workspace_id")
      .eq("id", data.automationId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error("Could not load the saved automation.");
    if (!row) throw new Error("Automation not found.");

    const parsed = flowShape.safeParse(row.flow_json);
    if (!parsed.success) throw new Error("The saved automation is invalid. Open it in the builder and save a corrected version.");

    const flow = {
      id: row.id,
      name: parsed.data.name || row.name,
      vertical: "general",
      live: row.status === "live",
      updatedAt: Date.now(),
      nodes: parsed.data.nodes as WorkflowNode[],
      edges: parsed.data.edges,
    };
    const issues = (await import("@/lib/workflow")).validate(flow);
    const blocking = issues.filter((issue) => issue.level === "error" || issue.level === "warn");
    if (blocking.length) throw new Error(`Fix the flow before running it: ${blocking[0]!.message}`);

    if (data.mode === "live") {
      if (row.status !== "live") throw new Error("This automation is not live in the cloud. No external action was taken.");
      for (const node of flow.nodes) {
        const reason = await (await import("@/lib/execute-step.server")).livePreflightError(node, context.userId);
        if (reason) throw new Error(reason);
      }
    }

    const executionPlan = planLinearExecution(flow);
    if (executionPlan.error) throw new Error(executionPlan.error);
    const connectedOrder = executionPlan.nodes;

    let releaseManualLock: (() => Promise<void>) | null = null;
    if (data.mode === "live") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: lockToken, error: lockError } = await supabaseAdmin.rpc("claim_manual_automation", {
        _automation_id: row.id,
        _lease_seconds: 600,
      });
      if (lockError) throw new Error("Could not safely claim this flow for execution.");
      if (!lockToken) throw new Error("This flow is already running. Wait for the current run to finish before starting another.");
      releaseManualLock = async () => {
        const { error: releaseError } = await supabaseAdmin.rpc("release_manual_automation", {
          _automation_id: row.id,
          _lock_token: lockToken,
        });
        if (releaseError) {
          console.error("[AutoStudio executor] Manual run lease release failed.", {
            automationId: row.id,
            errorCode: releaseError.code,
          });
        }
      };
    }

    let activeRunId: string | null = null;
    let runStartedMs = Date.now();
    try {
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    runStartedMs = startedMs;
    const { data: run, error: runError } = await context.supabase
      .from("run_logs")
      .insert({
        automation_id: row.id,
        workspace_id: row.workspace_id,
        status: "running",
        trigger_type: "manual",
        is_dry_run: data.mode === "dry",
        started_at: startedAt,
      })
      .select("id")
      .single();
    if (runError || !run) throw new Error("Could not start the run log. No external action was taken.");
    activeRunId = run.id;

    const steps: Array<{
      nodeId: string;
      label: string;
      status: "success" | "failed" | "dry_run";
      ms: number;
      detail: string;
    }> = [];

    for (let index = 0; index < connectedOrder.length; index++) {
      const node = connectedOrder[index]!;
      if (steps.some((step) => step.status === "failed")) break;
      let step;
      if (Date.now() - startedMs >= MAX_FLOW_RUNTIME_MS) {
        step = {
          nodeId: node.id,
          label: node.name,
          status: "failed" as const,
          ms: 0,
          detail: "The flow exceeded its four-minute execution budget. Remaining steps were halted.",
        };
      } else {
        try {
          step = await executeStep({ node, flowName: flow.name, userId: context.userId, mode: data.mode });
        } catch (error) {
          step = {
            nodeId: node.id,
            label: node.name,
            status: "failed" as const,
            ms: 0,
            detail: "The step stopped unexpectedly. Its external outcome may be uncertain; verify the destination before retrying.",
          };
        }
      }
      steps.push(step);
      const { error: stepLogError } = await context.supabase.from("run_step_logs").insert({
        run_id: run.id,
        workspace_id: row.workspace_id,
        step_index: index,
        node_id: node.id,
        node_label: step.label.slice(0, 160),
        status: step.status,
        outcome_state: classifyExecutionOutcome(step.status, step.detail),
        duration_ms: Math.max(0, Math.round(step.ms)),
        error_detail: step.status === "failed" ? step.detail.slice(0, 500) : null,
        output_snapshot: { detail: step.detail.slice(0, 500) },
      });
      if (stepLogError) {
        steps[steps.length - 1] = {
          ...step,
          status: "failed",
          detail: "The step result could not be safely recorded. Stop and verify external effects before retrying.",
        };
        break;
      }
    }

    const hasFailure = steps.some((step) => step.status === "failed");
    const finalStatus = hasFailure ? "failed" : data.mode === "dry" ? "dry_run" : "success";
    const finishedAt = new Date().toISOString();
    const { error: finishError } = await context.supabase
      .from("run_logs")
      .update({
        status: finalStatus,
        finished_at: finishedAt,
        duration_ms: Date.now() - startedMs,
        error_summary: hasFailure ? steps.find((step) => step.status === "failed")!.detail.slice(0, 500) : null,
      })
      .eq("id", run.id);
    if (finishError) {
      throw new Error("The run's final status could not be saved. Verify external effects before retrying.");
    }
    activeRunId = null;

    const { data: recent } = await context.supabase
      .from("run_logs")
      .select("status")
      .eq("automation_id", row.id)
      .order("started_at", { ascending: false })
      .limit(20);
    const history = recent ?? [];
    const successful = history.filter((entry) => entry.status === "success").length;
    const health = history.length ? Math.round((successful / history.length) * 100) : 0;
    await context.supabase
      .from("automations")
      .update({ last_run_at: finishedAt, health_score: health })
      .eq("id", row.id)
      .eq("user_id", context.userId);

    return { runId: run.id, status: finalStatus, mode: data.mode, steps };
    } catch (error) {
      if (activeRunId) {
        try {
          const failedAt = new Date().toISOString();
          const { error: auditError } = await context.supabase
            .from("run_logs")
            .update({
              status: "failed",
              finished_at: failedAt,
              duration_ms: Date.now() - runStartedMs,
              error_summary: "The manual run stopped unexpectedly. Verify external effects before retrying.",
            })
            .eq("id", activeRunId);
          if (auditError) {
            console.error("[AutoStudio executor] Could not mark interrupted manual run failed.", {
              automationId: row.id,
              runId: activeRunId,
              errorCode: auditError.code,
            });
          }
        } catch {
          console.error("[AutoStudio executor] Failed to record unexpected manual run failure.", {
            automationId: row.id,
            runId: activeRunId,
          });
        }
      }
      throw error;
    } finally {
      if (releaseManualLock) {
        try {
          await releaseManualLock();
        } catch {
          // Lease expiry is the final safety net; never mask the run result with cleanup failure.
          console.error("[AutoStudio executor] Manual run lease cleanup failed.");
        }
      }
    }
  });
