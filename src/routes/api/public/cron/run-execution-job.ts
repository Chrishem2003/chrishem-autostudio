import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { classifyExecutionOutcome } from "@/lib/execution-outcome";
import { executeFlowSteps } from "@/lib/execute-flow-steps.server";
import { createSupabaseExecutionJobDependencies } from "@/lib/execution-job-queue.server";
import { processOneExecutionJob } from "@/lib/execution-job-worker";
import { planLinearExecution } from "@/lib/execution-plan";
import { buildRunFinalization } from "@/lib/run-finalization";
import { executeStep } from "@/lib/execute-step.server";
import { workflowSchema } from "@/lib/workflow";

const MAX_JOB_RUNTIME_MS = 4 * 60 * 1000;

/**
 * Protected queue consumer. Configure the scheduler to call this endpoint
 * separately from run-scheduled; it claims and processes at most one durable job.
 * The database lease token fences heartbeats/finalization. Uncertain side effects
 * are never automatically replayed by this endpoint.
 */
export const Route = createFileRoute("/api/public/cron/run-execution-job")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const dependencies = createSupabaseExecutionJobDependencies(async (job, context) => {
          const { data: automation, error: automationError } = await supabaseAdmin
            .from("automations")
            .select("id, user_id, name, flow_json, status, workspace_id")
            .eq("id", job.automationId)
            .maybeSingle();

          if (automationError) {
            throw new Error("Could not load the automation for the queued job.");
          }
          if (!automation || automation.status !== "live") {
            return {
              status: "failed" as const,
              sideEffectCertainty: "not_attempted" as const,
              error: "Automation no longer exists or is not live; no steps were executed.",
            };
          }

          const parsed = workflowSchema.safeParse(automation.flow_json);
          if (!parsed.success) {
            return {
              status: "failed" as const,
              sideEffectCertainty: "not_attempted" as const,
              error: "Saved workflow failed schema validation; no steps were executed.",
            };
          }

          const plan = planLinearExecution(parsed.data);
          if (plan.error) {
            return {
              status: "failed" as const,
              sideEffectCertainty: "not_attempted" as const,
              error: "Saved workflow failed execution-plan validation; no steps were executed.",
            };
          }

          const started = Date.now();
          const startedAt = new Date(started).toISOString();
          const payload = job.payload && typeof job.payload === "object" && !Array.isArray(job.payload)
            ? job.payload as Record<string, unknown>
            : {};
          const triggerType = payload["triggerType"] === "manual" ? "manual" : "schedule";

          const { data: run, error: runError } = await supabaseAdmin
            .from("run_logs")
            .insert({
              automation_id: automation.id,
              workspace_id: automation.workspace_id,
              trigger_type: triggerType,
              is_dry_run: false,
              status: "running",
              started_at: startedAt,
            })
            .select("id")
            .single();

          if (runError || !run) {
            throw new Error("Could not persist the queued run before execution; no workflow steps were started.");
          }

          const execution = await executeFlowSteps({
            nodes: plan.nodes,
            flowName: parsed.data.name || automation.name,
            userId: automation.user_id,
            mode: "live",
            startedAtMs: started,
            maxRuntimeMs: MAX_JOB_RUNTIME_MS,
            execute: async (...args) => {
              const alive = await context.heartbeat();
              if (!alive) {
                throw new Error("Execution lease was lost; stop before starting another external action.");
              }
              return executeStep(...args);
            },
            persistIntent: async (node, index) => {
              const alive = await context.heartbeat();
              if (!alive) return null;
              const { data: intent, error } = await supabaseAdmin
                .from("run_step_logs")
                .insert({
                  run_id: run.id,
                  workspace_id: automation.workspace_id,
                  step_index: index,
                  node_id: node.id,
                  node_label: node.name.slice(0, 160),
                  status: "running",
                  outcome_state: "uncertain",
                  output_snapshot: { recoveryHint: "Queued worker recorded intent; outcome is not yet confirmed." },
                })
                .select("id")
                .single();
              if (error || !intent) return null;
              return { id: intent.id };
            },
            persistOutcome: async (intentId, step, outcomeState) => {
              const { error } = await supabaseAdmin
                .from("run_step_logs")
                .update({
                  status: step.status,
                  outcome_state: outcomeState,
                  duration_ms: Math.max(0, Math.round(step.ms)),
                  error_detail: step.status === "failed" ? step.detail.slice(0, 500) : null,
                  output_snapshot: { detail: step.detail.slice(0, 500), outcomeState },
                })
                .eq("id", intentId)
                .eq("run_id", run.id);
              return !error;
            },
            onUnexpectedError: (node, error) => {
              console.error("[AutoStudio queue worker] Step execution failed.", {
                jobId: job.id,
                runId: run.id,
                nodeId: node.id,
                errorName: error instanceof Error ? error.name : "UnknownError",
              });
            },
            onPersistenceError: (stage, node) => {
              console.error("[AutoStudio queue worker] Audit persistence failed; flow halted.", {
                jobId: job.id,
                runId: run.id,
                nodeId: node.id,
                stage,
              });
            },
          });

          const finalization = buildRunFinalization({
            steps: execution.steps,
            mode: "live",
            startedAtMs: started,
          });
          const { error: finishRunError } = await supabaseAdmin
            .from("run_logs")
            .update({
              status: finalization.status,
              finished_at: finalization.finishedAt,
              duration_ms: finalization.durationMs,
              error_summary: finalization.errorSummary,
            })
            .eq("id", run.id)
            .eq("status", "running");

          if (finishRunError) {
            // Do not return success to the queue when the audit summary is unknown.
            throw new Error("Run summary could not be persisted; inspect step audit records before retrying.");
          }

          if (finalization.status === "failed") {
            const outcomes = execution.steps.map((step) => classifyExecutionOutcome(step.status, step.detail));
            const sideEffectCertainty = outcomes.includes("uncertain")
              ? "uncertain" as const
              : outcomes.includes("confirmed")
                ? "effect_confirmed" as const
                : "confirmed_no_effect" as const;
            return {
              status: "failed" as const,
              sideEffectCertainty,
              error: finalization.errorSummary ?? "Workflow execution failed.",
            };
          }

          return { status: "succeeded" as const, sideEffectCertainty: "effect_confirmed" as const };
        });

        try {
          const result = await processOneExecutionJob(dependencies);
          return Response.json(result, { status: 200 });
        } catch (error) {
          console.error("[AutoStudio queue worker] Could not process a queue job.", {
            errorName: error instanceof Error ? error.name : "UnknownError",
          });
          return new Response("Queue worker failed safely", { status: 500 });
        }
      },
    },
  },
});
