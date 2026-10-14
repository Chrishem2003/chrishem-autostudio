import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { runCronTaskAfterAuthentication, runCronTaskWithFallback, withCronSecurityHeaders } from "@/lib/cron-task-guard";
import { isDurableQueueWorkerEnabled } from "@/lib/runtime-feature-gates";
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
import { confirmExecutionLeaseHeartbeat, runWithExecutionLeaseKeepalive } from "@/lib/execution-lease-keepalive.server";
import { isValidExecutionLeaseToken } from "@/lib/execution-lease-token";

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
        const guarded = await runCronTaskWithFallback(
          () => runCronTaskAfterAuthentication(request, authenticateCronRequest, async () => {
        // Operators can validate cron authentication and an empty queue before
        // enabling producers. This separate gate also prevents accidental draining
        // of old jobs when the worker scheduler is configured but not accepted.
        if (!isDurableQueueWorkerEnabled()) {
          return Response.json({ error: "Durable execution worker is disabled." }, {
            status: 503,
            headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
          });
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
          // RPC results are runtime data, not a trusted TypeScript guarantee.
          // Only a bounded string token may authorize lease heartbeats or release.
          // If the token shape is unknown, stop and let the lease expire rather
          // than passing an arbitrary value through the execution path.
          if (!isValidExecutionLeaseToken(executionLock)) {
            throw new Error("Automation execution lease returned an invalid token.");
          }

          // The queue lease and per-automation lease are separate fences. Renew
          // both before each new step so a long multi-step flow cannot outlive the
          // lock that prevents manual/scheduled overlap.
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
              if (!(await heartbeatBothLeases())) {
                throw new Error("Execution lease ownership was lost; stop before starting another external action.");
              }
              return runWithExecutionLeaseKeepalive(
                () => executeStep(args),
                heartbeatBothLeases,
              );
            },
            persistIntent: async (node, index) => {
              // Persisting an intent is an audit mutation too: record lease loss in
              // the shared flag so the catch path cannot recover/finalize this run
              // through a worker whose queue or automation ownership is unverified.
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
              // Do not let a stale worker rewrite audit outcomes after either lease
              // has been lost. Leave the intent uncertain for the fenced recovery path.
              if (!(await heartbeatBothLeases())) return false;
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

          // Finalize the audit run only while both fencing leases are still valid.
          // If ownership is lost, leave the run open for the authoritative reconciler.
          if (!(await heartbeatBothLeases())) {
            throw new Error("Execution lease ownership was lost before run finalization.");
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
              // Never finalize the parent run if its in-flight step intents could
              // not be reconciled. Leave it open for the stale-run recovery pass.
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
                // Recovery is best-effort: a database transport exception must not
                // replace the original execution error or imply the external effect
                // is safe to retry. Leave the job uncertain for lease-based review.
                console.error("[AutoStudio queue worker] Interrupted run recovery threw.", {
                  jobId: job.id,
                  runId: activeRunId,
                  errorName: recoveryError instanceof Error ? recoveryError.name : "UnknownError",
                });
              }
            }
            throw executionError;
          } finally {
            // Lock release is best-effort cleanup: a transport exception here must
            // not overwrite a known execution/audit outcome and turn a confirmed
            // side effect into a misleading worker failure. The lease has a bounded
            // expiry, so log safely and let expiry recover if release is uncertain.
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
          }),
          () => ({
            result: withCronSecurityHeaders(
              Response.json(
                { error: "Queue worker is temporarily unavailable." },
                { status: 503 },
              ),
            ),
          }),
        );
        if (guarded.denied) return withCronSecurityHeaders(guarded.denied);
        return withCronSecurityHeaders(guarded.result);
      },
    },
  },
});
