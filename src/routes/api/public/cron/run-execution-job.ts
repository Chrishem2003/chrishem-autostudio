import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import {
  authenticateCronRequestSafely,
  runCronTaskWithFallback,
  withCronSecurityHeaders,
} from "@/lib/cron-task-guard";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { classifyExecutionOutcome } from "@/lib/execution-outcome";
import { sanitizeExecutionError } from "@/lib/execution-error-sanitizer";
import { sanitizeRunOutput } from "@/lib/run-output-sanitizer";
import { executeFlowSteps } from "@/lib/execute-flow-steps.server";
import { createSupabaseExecutionJobDependencies } from "@/lib/execution-job-queue.server";
import { processOneExecutionJob } from "@/lib/execution-job-worker";
import { buildRunFinalization } from "@/lib/run-finalization";
import { preparePersistedExecutionPlan } from "@/lib/prepare-execution-plan";
import { isDurableQueueWorkerEnabled } from "@/lib/runtime-feature-gates";
import {
  confirmExecutionLeaseHeartbeat,
  runWithExecutionLeaseKeepalive,
} from "@/lib/execution-lease-keepalive.server";
import { isValidExecutionLeaseToken } from "@/lib/execution-lease-token";
import { executeStep, livePreflightError } from "@/lib/execute-step.server";
import { firstLivePreflightError } from "@/lib/live-execution-preflight";
import type { Workflow } from "@/lib/workflow";

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
        const response = await runCronTaskWithFallback(async () => {
        const denied = await authenticateCronRequestSafely(request, authenticateCronRequest);
        if (denied !== null) return denied;
        if (!isDurableQueueWorkerEnabled()) {
          return Response.json(
            { error: "Durable execution worker is disabled by rollout policy." },
            {
              status: 503,
              headers: {
                "Cache-Control": "no-store",
                "Pragma": "no-cache",
                "X-Content-Type-Options": "nosniff",
              },
            },
          );
        }

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

          const prepared = preparePersistedExecutionPlan(automation.flow_json);
          if (!prepared.success) {
            return {
              status: "failed" as const,
              sideEffectCertainty: "not_attempted" as const,
              error: "Saved workflow failed validation; no steps were executed.",
              retryable: false,
            };
          }
          const workflow = prepared.workflow as unknown as Workflow;
          const plan = prepared.plan;

          // Re-run live capability checks in the worker. The workflow or its
          // credentials may have changed after enqueue, so producer-side preflight
          // alone is not a sufficient authorization/safety boundary.
          const preflightError = await firstLivePreflightError(
            plan.nodes,
            automation.user_id,
            livePreflightError,
          );
          if (preflightError) {
            return {
              status: "failed" as const,
              sideEffectCertainty: "not_attempted" as const,
              error: preflightError,
              retryable: false,
            };
          }

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
          if (!isValidExecutionLeaseToken(executionLock)) {
            throw new Error("Automation execution lease returned an invalid token.");
          }

          // Queue-job and automation leases fence different resources. Both must
          // remain current before any provider action or audit mutation.
          const heartbeatAutomationLease = async (): Promise<boolean> =>
            confirmExecutionLeaseHeartbeat(async () => {
              const { data: alive, error } = await supabaseAdmin.rpc("heartbeat_manual_automation", {
                _automation_id: automation.id,
                _lock_token: executionLock,
                _lease_seconds: 300,
              });
              return !error && alive === true;
            });
          let executionLeaseLost = false;
          const heartbeatBothLeases = async (): Promise<boolean> => {
            if (!(await context.heartbeat())) {
              executionLeaseLost = true;
              return false;
            }
            if (!(await heartbeatAutomationLease())) {
              executionLeaseLost = true;
              return false;
            }
            return true;
          };

          let activeRunId: string | null = null;
          let runStartedMs = Date.now();
          try {
          const started = Date.now();
          runStartedMs = started;
          const startedAt = new Date(started).toISOString();
          const triggerType = job.triggerType === "scheduled" ? "schedule" : job.triggerType;

          const { data: run, error: runError } = await supabaseAdmin
            .from("run_logs")
            .insert({
              automation_id: automation.id,
              execution_job_id: job.id,
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
          activeRunId = run.id;

          const execution = await executeFlowSteps({
            nodes: plan.nodes,
            flowName: workflow.name || automation.name,
            userId: automation.user_id,
            mode: "live",
            startedAtMs: started,
            maxRuntimeMs: MAX_JOB_RUNTIME_MS,
            execute: async (args) => {
              if (!(await heartbeatBothLeases())) {
                throw new Error("Execution lease ownership was lost; stop before starting another external action.");
              }
              return runWithExecutionLeaseKeepalive(
                () => executeStep(args),
                heartbeatBothLeases,
              );
            },
            persistIntent: async (node, index) => {
              if (!(await heartbeatBothLeases())) return null;
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
              if (!(await heartbeatBothLeases())) return false;
              const { data: persistedStep, error } = await supabaseAdmin
                .from("run_step_logs")
                .update({
                  status: step.status,
                  outcome_state: outcomeState,
                  duration_ms: Math.max(0, Math.round(step.ms)),
                  error_detail: step.status === "failed"
                    ? sanitizeExecutionError(step.detail, "Step failed; inspect the run summary and verify external effects before retrying.")
                    : null,
                  output_snapshot: (sanitizeRunOutput({
                    detail: step.detail,
                    outcomeState,
                    ...(step.outputs ? { outputs: step.outputs } : {}),
                  }) ?? null) as never,
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

          if (!(await heartbeatBothLeases())) {
            throw new Error("Execution lease ownership was lost before run finalization; audit recovery is required.");
          }
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
              error_summary: finalization.errorSummary,
            })
            .eq("id", run.id)
            .eq("status", "running")
            .select("id")
            .maybeSingle();

          if (finishRunError || !finalizedRun) {
            // A zero-row update is also an unconfirmed finalization, not success.
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
            // A worker that lost either fence must not rewrite audit state. Leave
            // recovery to the stale-run reconciler rather than racing a new owner.
            if (activeRunId && !executionLeaseLost && await confirmExecutionLeaseHeartbeat(heartbeatBothLeases)) {
              try {
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
                let recoveredRun: { id: string } | null = null;
                let runRecoveryError: { code?: string } | null = null;
                if (!stepRecoveryError) {
                  const recovery = await supabaseAdmin
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
                  recoveredRun = recovery.data;
                  runRecoveryError = recovery.error;
                }
                if (stepRecoveryError || runRecoveryError || !recoveredRun) {
                  console.error("[AutoStudio queue worker] Interrupted run recovery was incomplete.", {
                    jobId: job.id,
                    runId: activeRunId,
                    stepRecoveryFailed: Boolean(stepRecoveryError),
                    runRecoveryFailed: Boolean(runRecoveryError),
                  });
                }
              } catch (recoveryError) {
                console.error("[AutoStudio queue worker] Interrupted run recovery threw.", {
                  jobId: job.id,
                  runId: activeRunId,
                  errorName: recoveryError instanceof Error ? recoveryError.name : "UnknownError",
                });
              }
            }
            throw executionError;          } finally {
            // Cleanup is best-effort; a transport error must not overwrite a
            // confirmed execution result. The lease expires safely if release is unknown.
            try {
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
            } catch (releaseError) {
              console.error("[AutoStudio queue worker] Automation lease release threw.", {
                jobId: job.id,
                automationId: automation.id,
                errorName: releaseError instanceof Error ? releaseError.name : "UnknownError",
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
        }, () => new Response("Queue worker failed safely", { status: 500 }));
        return withCronSecurityHeaders(response);
      },
    },
  },
});
