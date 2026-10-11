import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { runCronTaskAfterAuthentication } from "@/lib/cron-task-guard";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { classifyExecutionOutcome } from "@/lib/execution-outcome";
import { sanitizeExecutionAuditValue, sanitizeExecutionError } from "@/lib/execution-error-sanitizer";
import { executeFlowSteps } from "@/lib/execute-flow-steps.server";
import { createSupabaseExecutionJobDependencies } from "@/lib/execution-job-queue.server";
import { processOneExecutionJob } from "@/lib/execution-job-worker";
import { buildRunFinalization } from "@/lib/run-finalization";
import { withPreparedExecutionPlan } from "@/lib/prepared-execution-gate";
import { executeStep, livePreflightError } from "@/lib/execute-step.server";
import type { Workflow } from "@/lib/workflow";
import { createAndAttachExecutionJobRun } from "@/lib/execution-run-association";
import { firstLivePreflightError } from "@/lib/live-execution-preflight";

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
        const guarded = await runCronTaskAfterAuthentication(request, authenticateCronRequest, async () => {
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
              retryable: false,
            };
          }

          const gate = await withPreparedExecutionPlan(automation.flow_json, async (prepared) => {
            // Re-check capabilities because workflow or credentials may have changed after enqueue.
            const preflightError = await firstLivePreflightError(prepared.plan.nodes, automation.user_id, livePreflightError);
            return { prepared, preflightError };
          });
          if (!gate.success) return { status: "failed" as const, sideEffectCertainty: "not_attempted" as const, error: "Saved workflow failed validation; no steps were executed.", retryable: false };
          const { prepared, preflightError } = gate.value;
          if (preflightError) return { status: "failed" as const, sideEffectCertainty: "not_attempted" as const, error: preflightError, retryable: false };
          const workflow = prepared.workflow as unknown as Workflow;
          const plan = prepared.plan;

          // Serialize queue jobs per automation with the same lease used by
          // manual and scheduled entry points. A busy automation is safe to retry.
          const { data: executionLock, error: executionLockError } = await supabaseAdmin.rpc("claim_manual_automation", {
            _automation_id: automation.id,
            _lease_seconds: 300,
          });
          if (executionLockError) {
            throw new Error("Could not safely claim automation execution lease.");
          }
          if (!executionLock) {
            return {
              status: "failed" as const,
              sideEffectCertainty: "not_attempted" as const,
              retryAt: new Date(Date.now() + 30_000).toISOString(),
              error: "Another run currently owns this automation; this queued job did not execute any steps.",
              retryable: true,
            };
          }

          let activeRunId: string | null = null;
          let runStartedMs = Date.now();
          try {
          const started = Date.now();
          runStartedMs = started;
          const startedAt = new Date(started).toISOString();
          // Use the authoritative trigger type returned by the database claim, not
          // caller payload metadata. The run log uses "schedule" for scheduled jobs.
          const triggerType = job.triggerType === "scheduled" ? "schedule" : job.triggerType;

          const runId = await createAndAttachExecutionJobRun({
            createRun: async () => {
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
              return { runId: run?.id ?? null, failed: Boolean(runError || !run) };
            },
            attachRun: async (createdRunId) => {
              const { data: attached, error: attachError } = await supabaseAdmin.rpc("attach_execution_job_run", {
                _job_id: job.id,
                _worker_token: job.workerToken,
                _run_id: createdRunId,
              });
              return { attached: !attachError && attached === true };
            },
            onRunCreated: (createdRunId) => {
              // Preserve the run ID for uncertainty-aware recovery even if the
              // subsequent durable-job association fails.
              activeRunId = createdRunId;
            },
          });
          const run = { id: runId };

          const execution = await executeFlowSteps({
            nodes: plan.nodes,
            flowName: workflow.name || automation.name,
            userId: automation.user_id,
            mode: "live",
            startedAtMs: started,
            maxRuntimeMs: MAX_JOB_RUNTIME_MS,
            execute: async (args) => {
              const alive = await context.heartbeat();
              if (!alive) {
                throw new Error("Execution lease was lost; stop before starting another external action.");
              }
              return executeStep(args);
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
              const { data: persistedStep, error } = await supabaseAdmin
                .from("run_step_logs")
                .update({
                  status: step.status,
                  outcome_state: outcomeState,
                  duration_ms: Math.max(0, Math.round(step.ms)),
                  error_detail: step.status === "failed"
                    ? sanitizeExecutionError(step.detail, "Step failed; inspect provider state before retrying.")
                    : null,
                  output_snapshot: {
                    detail: sanitizeExecutionError(step.detail, "Step completed without safe detail."),
                    outcomeState,
                    ...(step.outputs ? { outputs: sanitizeExecutionAuditValue(step.outputs) as import("@/integrations/supabase/types").Json } : {}),
                  },
                })
                .eq("id", intentId)
                .eq("run_id", run.id)
                .select("id")
                .maybeSingle();
              return !error && Boolean(persistedStep);
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
          const { data: finalizedRun, error: finishRunError } = await supabaseAdmin
            .from("run_logs")
            .update({
              status: finalization.status,
              finished_at: finalization.finishedAt,
              duration_ms: finalization.durationMs,
              error_summary: finalization.errorSummary
                ? sanitizeExecutionError(finalization.errorSummary, "Workflow failed; inspect step records and verify external outcomes.")
                : null,
            })
            .eq("id", run.id)
            .eq("status", "running")
            .select("id")
            .maybeSingle();

          if (finishRunError || !finalizedRun) {
            // A zero-row update is also an unconfirmed finalization, not success.
            // Do not return success to the queue when the audit summary is unknown.
            throw new Error("Run summary could not be confirmed as persisted; inspect step audit records before retrying.");
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
          } catch (executionError) {
            // Keep run history reconcilable when an unexpected error occurs after
            // the run row exists. In-flight step intents stay explicitly uncertain.
            if (activeRunId) {
              const finishedAt = new Date().toISOString();
              const { error: stepRecoveryError } = await supabaseAdmin
                .from("run_step_logs")
                .update({
                  status: "failed",
                  outcome_state: "uncertain",
                  error_detail: "Worker stopped before confirming this step. Verify external effects before retrying.",
                  output_snapshot: { recoveryHint: "Queued worker failed after recording intent; verify the external outcome before retrying." },
                })
                .eq("run_id", activeRunId)
                .eq("status", "running")
                .select("id");
              const { data: recoveredRun, error: runRecoveryError } = await supabaseAdmin
                .from("run_logs")
                .update({
                  status: "failed",
                  finished_at: finishedAt,
                  duration_ms: Math.max(0, Date.now() - runStartedMs),
                  error_summary: "Queued execution stopped unexpectedly. Verify uncertain step outcomes before retrying.",
                })
                .eq("id", activeRunId)
                .eq("status", "running")
                .select("id")
                .maybeSingle();
              if (stepRecoveryError || runRecoveryError || !recoveredRun) {
                console.error("[AutoStudio queue worker] Interrupted run recovery was incomplete.", {
                  jobId: job.id,
                  runId: activeRunId,
                  stepRecoveryFailed: Boolean(stepRecoveryError),
                  runRecoveryFailed: Boolean(runRecoveryError),
                });
              }
            }
            throw executionError;
          } finally {
            const { error: releaseError } = await supabaseAdmin.rpc("release_manual_automation", {
              _automation_id: automation.id,
              _lock_token: executionLock,
            });
            if (releaseError) {
              console.error("[AutoStudio queue worker] Automation lease release failed.", {
                jobId: job.id,
                automationId: automation.id,
                errorCode: releaseError.code,
              });
            }
          }
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
        });
        if (guarded.denied) return guarded.denied;
        return guarded.result;
      },
    },
  },
});
