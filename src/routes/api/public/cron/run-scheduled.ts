import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { authenticateCronRequestSafely, runCronTaskWithFallback, withCronSecurityHeaders } from "@/lib/cron-task-guard";
import { isDue } from "@/lib/schedule";
import type { Workflow } from "@/lib/workflow";
import { executeFlowSteps } from "@/lib/execute-flow-steps.server";
import { withPreparedExecutionPlan } from "@/lib/prepared-execution-gate";
import { buildRunFinalization } from "@/lib/run-finalization";
import { enqueueExecutionJob } from "@/lib/execution-job-queue.server";
import { isDurableQueueEnabled } from "@/lib/runtime-feature-gates";
import { executeStep, livePreflightError } from "@/lib/execute-step.server";
import { sanitizeExecutionAuditValue, sanitizeExecutionError } from "@/lib/execution-error-sanitizer";
import { firstLivePreflightError } from "@/lib/live-execution-preflight";
import { confirmExecutionLeaseHeartbeat, runWithExecutionLeaseKeepalive } from "@/lib/execution-lease-keepalive.server";

const MAX_SCHEDULED_FLOW_RUNTIME_MS = 4 * 60 * 1000;

export const Route = createFileRoute("/api/public/cron/run-scheduled")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Share the worker's fail-closed authentication contract. Only literal
        // null authorizes work; malformed adapter values must not bypass the gate.
        const denied = await authenticateCronRequestSafely(request, authenticateCronRequest);
        if (denied !== null) return denied;

        return runCronTaskWithFallback(async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Reconcile stale manual and scheduled runs through one transactional RPC.
        // It checks the automation lease before closing the audit record and marks
        // unfinished steps uncertain rather than replaying external effects.
        const staleBefore = new Date(Date.now() - 20 * 60 * 1000).toISOString();
        const { data: staleRuns, error: staleQueryError } = await supabaseAdmin
          .from("run_logs").select("id").eq("status", "running")
          .in("trigger_type", ["manual", "schedule"]).lt("started_at", staleBefore)
          .order("started_at", { ascending: true }).limit(100);
        if (staleQueryError) {
          console.error("[AutoStudio scheduler] Could not inspect stale runs; refusing to schedule new work.", { errorCode: staleQueryError.code });
          return withCronSecurityHeaders(new Response("stale-run reconciliation failed", { status: 500 }));
        }
        for (const stale of staleRuns ?? []) {
          const { data: recoveryResult, error: recoveryError } = await supabaseAdmin.rpc(
            "reconcile_stale_execution_run" as never,
            { _run_id: stale.id, _lock_token: null } as never,
          );
          if (recoveryError || !["reconciled", "not_running", "not_stale", "active_lease"].includes(String(recoveryResult))) {
            console.error("[AutoStudio scheduler] Stale run reconciliation was not safe to complete; refusing to schedule new work.", {
              runId: stale.id, errorCode: recoveryError?.code ?? String(recoveryResult ?? "NO_RECOVERY_RESULT"),
            });
            return withCronSecurityHeaders(new Response("stale-run reconciliation failed", { status: 500 }));
          }
        }
        const { data: rows, error } = await supabaseAdmin
          .from("automations")
          .select("id, user_id, name, flow_json, last_run_at, workspace_id")
          .eq("status", "live")
          .limit(500);
        if (error) return withCronSecurityHeaders(new Response("query failed", { status: 500 }));

        const now = new Date();
        let ran = 0;
        let failed = 0;
        for (const row of rows ?? []) {
          const gate = await withPreparedExecutionPlan(row.flow_json, async (prepared) => {
            const wf = prepared.workflow as unknown as Workflow;
            const trigger = wf.nodes.find((node) => node.defId === "trigger.schedule");
            if (!trigger) return { prepared, trigger: null, cadence: null, due: false, preflightError: null };
            const cadence = trigger.config?.["cadence"] || "Hourly";
            const due = isDue(cadence, row.last_run_at ? new Date(row.last_run_at) : null, now, trigger.config?.["timezone"]);
            if (!due) return { prepared, trigger, cadence, due: false, preflightError: null };
            const preflightError = await firstLivePreflightError(prepared.plan.nodes, row.user_id, livePreflightError);
            return { prepared, trigger, cadence, due, preflightError };
          });
          if (!gate.success) { console.warn("[AutoStudio scheduler] Saved workflow failed execution preflight.", { automationId: row.id, reason: gate.error }); continue; }
          const { prepared, trigger, cadence, due, preflightError } = gate.value;
          if (!trigger || !due) continue;
          if (preflightError) { console.warn("[AutoStudio scheduler] Scheduled workflow failed live capability preflight; no run was started.", { automationId: row.id, reason: preflightError }); failed++; continue; }
          const wf = prepared.workflow as unknown as Workflow;
          const executionPlan = prepared.plan;

          // Roll out durable queue consumption explicitly. Until the worker cron is
          // configured and runtime-validated, the legacy direct path remains the
          // default. With the flag enabled, this branch only enqueues and never
          // executes workflow steps in the scheduler request.
          if (isDurableQueueEnabled()) {
            const { data: queueLock, error: queueLockError } = await supabaseAdmin.rpc("claim_scheduled_automation", {
              _automation_id: row.id,
              _lease_seconds: 900,
            });
            if (queueLockError || !queueLock) continue;

            const enqueuedAt = new Date().toISOString();
            const idempotencyKey = "schedule:" + row.id + ":" + (row.last_run_at ? Date.parse(row.last_run_at) : 0) + ":" + String(cadence).slice(0, 32);
            let enqueueSucceeded = false;
            try {
              await enqueueExecutionJob({
                automationId: row.id,
                triggerType: "scheduled",
                idempotencyKey,
                requestedBy: row.user_id,
                // Keep the payload stable for a given idempotency key. If enqueue succeeds
                // but lease release fails, the next scheduler pass must receive the same
                // logical request instead of conflicting on a fresh wall-clock timestamp.
                payload: { triggerType: "schedule" },
              });
              enqueueSucceeded = true;
              ran++;
            } catch (queueError) {
              failed++;
              console.error("[AutoStudio scheduler] Durable job enqueue failed.", {
                automationId: row.id,
                errorName: queueError instanceof Error ? queueError.name : "UnknownError",
              });
            }

            const { error: queueReleaseError } = await supabaseAdmin.rpc("release_scheduled_automation", {
              _automation_id: row.id,
              _lock_token: queueLock,
              _last_run_at: enqueueSucceeded ? enqueuedAt : (row.last_run_at ?? "1970-01-01T00:00:00.000Z"),
            });
            if (queueReleaseError) {
              console.error("[AutoStudio scheduler] Could not release queue-enqueue lease.", {
                automationId: row.id,
                errorCode: queueReleaseError.code,
              });
              failed++;
            }
            continue;
          }

          const { data: lockToken, error: claimError } = await supabaseAdmin.rpc("claim_scheduled_automation", {
            _automation_id: row.id,
            _lease_seconds: 900,
          });
          if (claimError) {
            console.error("[AutoStudio scheduler] Could not claim scheduled flow.", {
              automationId: row.id,
              errorCode: claimError.code,
            });
            continue;
          }
          if (!lockToken) continue; // Another scheduler already owns this run or the lease is still active.

          const started = Date.now();
          const startedAt = new Date(started).toISOString();
          // Keep lease cleanup around every post-claim operation, including unexpected
          // database/runtime exceptions and early continues.
          let leaseCursor = startedAt;
          let activeRunId: string | null = null;
          let executionLeaseLost = false;
          const heartbeatScheduledLease = async (): Promise<boolean> =>
            confirmExecutionLeaseHeartbeat(async () => {
              const { data: alive, error: heartbeatError } = await supabaseAdmin.rpc("heartbeat_manual_automation", {
                _automation_id: row.id,
                _lock_token: lockToken,
                _lease_seconds: 900,
              });
              return !heartbeatError && alive === true;
            });
          const confirmScheduledLease = async (): Promise<boolean> => {
            if (executionLeaseLost) return false;
            if (!(await heartbeatScheduledLease())) {
              executionLeaseLost = true;
              return false;
            }
            return true;
          };
          try {
          // Reconfirm ownership after scheduler setup and immediately before
          // creating an audit run; a delayed claim response must not start work
          // after another scheduler could have acquired the expired lease.
          if (!(await confirmScheduledLease())) {
            throw new Error("Scheduled execution lease ownership could not be confirmed before run creation.");
          }
          // Persist the run before any external side effects. If audit persistence
          // is unavailable, fail closed and release the lease without executing.
          const { data: run, error: runError } = await supabaseAdmin
            .from("run_logs")
            .insert({
              automation_id: row.id,
              workspace_id: row.workspace_id,
              trigger_type: "schedule",
              is_dry_run: false,
              status: "running",
              started_at: startedAt,
            })
            .select("id")
            .single();

          if (runError || !run) {
            console.error("[AutoStudio scheduler] Could not persist run start; flow was not executed.", {
              automationId: row.id,
              errorCode: runError?.code ?? "NO_RUN_RECORD",
            });
            leaseCursor = new Date().toISOString();
            failed++;
            continue;
          }

          activeRunId = run.id;
          ran++;
          const execution = await executeFlowSteps({
            execute: async (args) => {
              if (!(await confirmScheduledLease())) {
                throw new Error("Scheduled execution lease ownership was lost; stop before starting another external action.");
              }
              return runWithExecutionLeaseKeepalive(
                () => executeStep(args),
                confirmScheduledLease,
              );
            },
            nodes: executionPlan.nodes,
            flowName: wf.name || row.name,
            userId: row.user_id,
            mode: "live",
            startedAtMs: started,
            maxRuntimeMs: MAX_SCHEDULED_FLOW_RUNTIME_MS,
            persistIntent: async (node, index) => {
              if (!(await confirmScheduledLease())) return null;
              const { data: attempt, error: intentError } = await supabaseAdmin
                .from("run_step_logs")
                .insert({
                  run_id: run.id,
                  workspace_id: row.workspace_id,
                  step_index: index,
                  node_id: node.id,
                  node_label: node.name.slice(0, 160),
                  status: "running",
                  outcome_state: "uncertain",
                  output_snapshot: { recoveryHint: "Execution intent recorded; final outcome not yet confirmed." },
                })
                .select("id")
                .single();
              if (intentError || !attempt) return null;
              return { id: attempt.id };
            },
            persistOutcome: async (intentId, step, outcomeState) => {
              if (!(await confirmScheduledLease())) return false;
              const { data: persistedStep, error: stepError } = await supabaseAdmin.from("run_step_logs").update({
                status: step.status,
                outcome_state: outcomeState,
                duration_ms: Math.max(0, Math.round(step.ms)),
                error_detail: step.status === "failed"
                  ? sanitizeExecutionError(step.detail, "Step failed; inspect provider state before retrying.")
                  : null,
                output_snapshot: {
                  detail: sanitizeExecutionError(step.detail, "Step completed without safe detail."),
                  outcomeState,
                  ...(step.outputs
                    ? { outputs: sanitizeExecutionAuditValue(step.outputs) as import("@/integrations/supabase/types").Json }
                    : {}),
                },
              }).eq("id", intentId).eq("run_id", run.id).select("id").maybeSingle();
              return !stepError && Boolean(persistedStep);
            },
            onUnexpectedError: (node, error) => {
              console.error("[AutoStudio scheduler] Step failed unexpectedly.", {
                automationId: row.id,
                nodeId: node.id,
                errorName: error instanceof Error ? error.name : "UnknownError",
              });
            },
            onPersistenceError: (stage, node) => {
              console.error("[AutoStudio scheduler] Step audit persistence failed; halting flow.", {
                automationId: row.id,
                runId: run.id,
                nodeId: node.id,
                stage,
              });
            },
          });
          const steps = execution.steps;

          if (!(await confirmScheduledLease())) {
            throw new Error("Scheduled execution lease ownership was lost before run finalization.");
          }
          const finalization = buildRunFinalization({ steps, mode: "live", startedAtMs: started });
          if (finalization.status === "failed") failed++;
          const finishedAt = finalization.finishedAt;
          leaseCursor = finishedAt;
          const { data: finalizedRun, error: finishError } = await supabaseAdmin
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

          if (finishError || !finalizedRun) {
            console.error("[AutoStudio scheduler] Could not persist run summary; attempting a failed-state fallback.", {
              automationId: row.id,
              runId: run.id,
              errorCode: finishError?.code ?? "NO_ROW_UPDATED",
            });
            // The initial finalization request may have stalled long enough for
            // this worker's lease to expire. Reconfirm ownership before any fallback
            // audit mutation; otherwise leave the run for stale-run reconciliation.
            if (!(await confirmScheduledLease())) {
              throw new Error("Scheduled execution lease ownership was lost before finalization fallback.");
            }
            const { data: fallbackRun, error: fallbackError } = await supabaseAdmin
              .from("run_logs")
              .update({
                status: "failed",
                finished_at: finishedAt,
                duration_ms: Date.now() - started,
                error_summary: "The final run summary could not be safely persisted. Verify recorded step outcomes before retrying.",
              })
              .eq("id", run.id)
              .eq("status", "running")
              .select("id")
              .maybeSingle();
            if (fallbackError || !fallbackRun) {
              console.error("[AutoStudio scheduler] Failed-state fallback also failed.", {
                automationId: row.id,
                runId: run.id,
                errorCode: fallbackError?.code ?? "NO_ROW_UPDATED",
              });
            }
          }
          activeRunId = null;

          } catch (error) {
            console.error("[AutoStudio scheduler] Unexpected run-level failure.", {
              automationId: row.id,
              errorName: error instanceof Error ? error.name : "UnknownError",
            });
            if (activeRunId && !executionLeaseLost && await confirmScheduledLease()) {
              try {
                const failedAt = new Date().toISOString();
                const { error: stepRecoveryError } = await supabaseAdmin
                  .from("run_step_logs")
                  .update({
                    status: "failed",
                    outcome_state: "uncertain",
                    error_detail: "The scheduled worker stopped before confirming this step. Verify external effects before retrying.",
                    output_snapshot: { recoveryHint: "Interrupted scheduled run; external step outcome is uncertain. Verify before retry." },
                  })
                  .eq("run_id", activeRunId)
                  .eq("status", "running");
                if (stepRecoveryError) {
                  console.error("[AutoStudio scheduler] Could not recover interrupted step intents.", {
                    automationId: row.id,
                    runId: activeRunId,
                    errorCode: stepRecoveryError.code,
                  });
                }
                // Do not finalize the parent run until all in-flight step intents
                // have been reconciled. The stale-run recovery pass can retry safely.
                if (!stepRecoveryError) {
                  const { data: recoveredRun, error: auditError } = await supabaseAdmin
                    .from("run_logs")
                    .update({
                      status: "failed",
                      finished_at: failedAt,
                      duration_ms: Math.max(0, Date.now() - started),
                      error_summary: "The scheduled run stopped unexpectedly. Verify external effects before retrying.",
                    })
                    .eq("id", activeRunId)
                    .eq("status", "running")
                    .select("id")
                    .maybeSingle();
                  if (auditError || !recoveredRun) {
                    console.error("[AutoStudio scheduler] Could not mark interrupted run failed.", {
                      automationId: row.id,
                      runId: activeRunId,
                      errorCode: auditError?.code ?? "NO_ROW_UPDATED",
                    });
                  }
                }
              } catch {
                console.error("[AutoStudio scheduler] Failed to record unexpected run failure.", {
                  automationId: row.id,
                  runId: activeRunId,
                });
              }
            }
            failed++;
          } finally {
            // Token-checked release cannot clear another worker's lease. Keep the
            // cadence cursor even when an unexpected exception interrupts this run.
            try {
              const { data: released, error: releaseError } = await supabaseAdmin.rpc("release_scheduled_automation", {
                _automation_id: row.id,
                _lock_token: lockToken,
                _last_run_at: leaseCursor,
              });
              if (releaseError || !released) {
                console.error("[AutoStudio scheduler] Could not release scheduled-flow lease.", {
                  automationId: row.id,
                  errorCode: releaseError?.code ?? "LEASE_NOT_OWNED",
                });
              }
            } catch {
              // Lease expiry is the fallback if the database itself is unavailable.
              console.error("[AutoStudio scheduler] Lease cleanup threw unexpectedly.", {
                automationId: row.id,
              });
            }
          }
        }

        return withCronSecurityHeaders(Response.json({ checked: rows?.length ?? 0, ran, failed, finishedAt: now.toISOString() }));
        }, () => {
          // Unexpected client/runtime exceptions may contain sensitive details.
          // Log a fixed message and return only a generic, cache-safe response.
          console.error("[AutoStudio scheduler] Unexpected scheduler failure; returning a generic response.");
          return withCronSecurityHeaders(
            Response.json(
              { error: "Scheduled execution is temporarily unavailable." },
              { status: 503 },
            ),
          );
        });
      },
    },
  },
});
