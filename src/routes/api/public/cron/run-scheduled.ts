import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { isDue } from "@/lib/schedule";
import type { Workflow } from "@/lib/workflow";
import { planLinearExecution } from "@/lib/execution-plan";
import { classifyExecutionOutcome } from "@/lib/execution-outcome";
import { executeStep } from "@/lib/execute-step.server";

const MAX_SCHEDULED_FLOW_RUNTIME_MS = 4 * 60 * 1000;

export const Route = createFileRoute("/api/public/cron/run-scheduled")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Recover abandoned scheduled runs only after the maximum lease plus
        // runtime window. Their in-flight steps are uncertain, never replayed here.
        const staleBefore = new Date(Date.now() - 20 * 60 * 1000).toISOString();
        const { data: staleRuns, error: staleQueryError } = await supabaseAdmin
          .from("run_logs")
          .select("id, started_at")
          .eq("status", "running")
          .eq("trigger_type", "schedule")
          .lt("started_at", staleBefore)
          .limit(100);
        if (staleQueryError) {
          console.error("[AutoStudio scheduler] Could not inspect stale runs; refusing to schedule new work.", { errorCode: staleQueryError.code });
          return new Response("stale-run reconciliation failed", { status: 500 });
        }
        for (const stale of staleRuns ?? []) {
          const { error: stepRecoveryError } = await supabaseAdmin
            .from("run_step_logs")
            .update({
              status: "failed",
              outcome_state: "uncertain",
              error_detail: "The worker stopped before confirming this step. Verify external effects before retrying.",
              output_snapshot: { recoveryHint: "Stale in-flight step; external outcome is uncertain. Verify before retry." },
            })
            .eq("run_id", stale.id)
            .eq("status", "running");
          if (stepRecoveryError) {
            console.error("[AutoStudio scheduler] Could not recover stale step logs; refusing to schedule new work.", {
              runId: stale.id, errorCode: stepRecoveryError.code,
            });
            return new Response("stale-step reconciliation failed", { status: 500 });
          }
          const { error: runRecoveryError } = await supabaseAdmin
            .from("run_logs")
            .update({
              status: "failed",
              finished_at: new Date().toISOString(),
              error_summary: "The scheduled worker stopped before finalizing this run. Inspect uncertain step outcomes before retrying.",
            })
            .eq("id", stale.id)
            .eq("status", "running");
          if (runRecoveryError) {
            console.error("[AutoStudio scheduler] Could not finalize stale run; refusing to schedule new work.", {
              runId: stale.id, errorCode: runRecoveryError.code,
            });
            return new Response("stale-run finalization failed", { status: 500 });
          }
        }
        const { data: rows, error } = await supabaseAdmin
          .from("automations")
          .select("id, user_id, name, flow_json, last_run_at, workspace_id")
          .eq("status", "live")
          .limit(500);
        if (error) return new Response("query failed", { status: 500 });

        const now = new Date();
        let ran = 0;
        let failed = 0;
        for (const row of rows ?? []) {
          const wf = row.flow_json as unknown as Workflow | null;
          if (!wf?.nodes || !Array.isArray(wf.nodes)) continue;
          const executionPlan = planLinearExecution(wf);
          if (executionPlan.error) {
            console.warn("[AutoStudio scheduler] Flow rejected by execution planner.", {
              automationId: row.id,
              reason: executionPlan.error,
            });
            continue;
          }
          const trigger = wf.nodes.find((node) => node.defId === "trigger.schedule");
          if (!trigger) continue;
          const cadence = trigger.config?.["cadence"] || "Hourly";
          if (!isDue(cadence, row.last_run_at ? new Date(row.last_run_at) : null, now, trigger.config?.["timezone"])) continue;

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
          try {
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
          const steps: Array<{
            nodeId: string;
            label: string;
            status: "success" | "failed" | "dry_run";
            ms: number;
            detail: string;
          }> = [];

          for (let index = 0; index < executionPlan.nodes.length; index++) {
            const node = executionPlan.nodes[index]!;
            if (steps.some((step) => step.status === "failed")) break;

            // Durable intent precedes every side effect. If the worker crashes,
            // the row remains running/uncertain and must be inspected, not replayed.
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
            if (intentError || !attempt) {
              console.error("[AutoStudio scheduler] Could not persist step intent; no action attempted.", {
                automationId: row.id, runId: run.id, nodeId: node.id, errorCode: intentError?.code ?? "NO_ATTEMPT_RECORD",
              });
              steps.push({
                nodeId: node.id, label: node.name.slice(0, 160), status: "failed", ms: 0,
                detail: "Could not persist the step intent. No action was attempted; remaining steps were halted.",
              });
              break;
            }

            if (Date.now() - started >= MAX_SCHEDULED_FLOW_RUNTIME_MS) {
              steps.push({
                nodeId: node.id,
                label: node.name.slice(0, 160),
                status: "failed",
                ms: 0,
                detail: "Scheduled flow exceeded its four-minute execution budget. Remaining steps were halted.",
              });
            } else {
              try {
                steps.push(await executeStep({
                  node,
                  flowName: wf.name || row.name,
                  userId: row.user_id,
                  mode: "live",
                }));
              } catch (error) {
                console.error("[AutoStudio scheduler] Step failed.", {
                  automationId: row.id,
                  nodeId: node.id,
                  errorName: error instanceof Error ? error.name : "UnknownError",
                });
                steps.push({
                  nodeId: node.id,
                  label: node.name.slice(0, 160),
                  status: "failed",
                  ms: 0,
                  detail: "The step stopped unexpectedly. Its external outcome may be uncertain; verify the destination before retrying.",
                });
              }
            }

            // Finalize the intent row rather than inserting a second record.
            // If this write fails, the original uncertain row remains durable.
            const step = steps[steps.length - 1]!;
            const outcomeState = classifyExecutionOutcome(step.status, step.detail);
            const { error: stepError } = await supabaseAdmin.from("run_step_logs").update({
              status: step.status,
              outcome_state: outcomeState,
              duration_ms: Math.max(0, Math.round(step.ms)),
              error_detail: step.status === "failed" ? step.detail.slice(0, 500) : null,
              output_snapshot: { detail: step.detail.slice(0, 500), outcomeState },
            }).eq("id", attempt.id);
            if (stepError) {
              console.error("[AutoStudio scheduler] Could not persist step outcome; stopping flow.", {
                automationId: row.id, runId: run.id, nodeId: node.id, errorCode: stepError.code,
              });
              steps[steps.length - 1] = {
                ...step,
                status: "failed",
                detail: "The step outcome could not be safely recorded. Verify external effects before retrying.",
              };
              break;
            }
          }

          const hasFailure = steps.some((step) => step.status === "failed");
          if (hasFailure) failed++;
          const finishedAt = new Date().toISOString();
          leaseCursor = finishedAt;
          const { error: finishError } = await supabaseAdmin
            .from("run_logs")
            .update({
              status: hasFailure ? "failed" : "success",
              finished_at: finishedAt,
              duration_ms: Date.now() - started,
              error_summary: hasFailure ? steps.find((step) => step.status === "failed")!.detail.slice(0, 500) : null,
            })
            .eq("id", run.id);

          if (finishError) {
            console.error("[AutoStudio scheduler] Could not persist run summary; attempting a failed-state fallback.", {
              automationId: row.id,
              runId: run.id,
              errorCode: finishError.code,
            });
            const { error: fallbackError } = await supabaseAdmin
              .from("run_logs")
              .update({
                status: "failed",
                finished_at: finishedAt,
                duration_ms: Date.now() - started,
                error_summary: "The final run summary could not be safely persisted. Verify recorded step outcomes before retrying.",
              })
              .eq("id", run.id);
            if (fallbackError) {
              console.error("[AutoStudio scheduler] Failed-state fallback also failed.", {
                automationId: row.id,
                runId: run.id,
                errorCode: fallbackError.code,
              });
            }
          }
          activeRunId = null;

          } catch (error) {
            console.error("[AutoStudio scheduler] Unexpected run-level failure.", {
              automationId: row.id,
              errorName: error instanceof Error ? error.name : "UnknownError",
            });
            if (activeRunId) {
              try {
                const failedAt = new Date().toISOString();
                const { error: auditError } = await supabaseAdmin
                  .from("run_logs")
                  .update({
                    status: "failed",
                    finished_at: failedAt,
                    duration_ms: Date.now() - started,
                    error_summary: "The scheduled run stopped unexpectedly. Verify external effects before retrying.",
                  })
                  .eq("id", activeRunId);
                if (auditError) {
                  console.error("[AutoStudio scheduler] Could not mark interrupted run failed.", {
                    automationId: row.id,
                    runId: activeRunId,
                    errorCode: auditError.code,
                  });
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

        return Response.json({ checked: rows?.length ?? 0, ran, failed, finishedAt: now.toISOString() });
      },
    },
  },
});
