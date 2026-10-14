import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { authenticateCronRequestSafely, runCronTaskWithFallback, withCronSecurityHeaders } from "@/lib/cron-task-guard";
import { isDue } from "@/lib/schedule";
import type { Workflow } from "@/lib/workflow";
import { withPreparedExecutionPlan } from "@/lib/prepared-execution-gate";
import { enqueueExecutionJob } from "@/lib/execution-job-queue.server";
import { isDurableQueueEnabled } from "@/lib/runtime-feature-gates";
import { firstLivePreflightError } from "@/lib/live-execution-preflight";
import { livePreflightError } from "@/lib/execute-step.server";
import { scheduledExecutionIdempotencyKey } from "@/lib/scheduled-execution-key";
import { normalizeScheduledTriggerConfig } from "@/lib/scheduled-trigger-config";
import { isScheduledLeaseReleaseConfirmed, runScheduledEnqueueAttempt, shouldReleaseScheduledLease } from "@/lib/scheduled-enqueue-attempt";

const MAX_SCHEDULED_FLOW_RUNTIME_MS = 4 * 60 * 1000;

export const Route = createFileRoute("/api/public/cron/run-scheduled")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Share the worker's fail-closed authentication contract. Only literal
        // null authorizes work; malformed adapter values must not bypass the gate.
        const denied = await authenticateCronRequestSafely(request, authenticateCronRequest);
        if (denied !== null) return denied;

        // Fail closed before stale-run reconciliation or schedule processing.
        // The scheduler must never fall back to inline provider execution when
        // durable queue rollout is disabled.
        if (!isDurableQueueEnabled()) {
          return withCronSecurityHeaders(Response.json(
            { error: "Scheduled execution queue is disabled by rollout policy." },
            { status: 503 },
          ));
        }

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
            // Normalize persisted JSON at the trust boundary. Unsupported
            // cadence values are surfaced as failures rather than silently
            // disabling a live automation; invalid timezones fall back to UTC.
            const normalizedConfig = normalizeScheduledTriggerConfig(trigger.config);
            if (!normalizedConfig) {
              return { prepared, trigger, cadence: "", due: true, preflightError: "Invalid schedule configuration." };
            }
            const { cadence, timezone } = normalizedConfig;
            const due = isDue(
              cadence,
              row.last_run_at ? new Date(row.last_run_at) : null,
              now,
              timezone,
            );
            if (!due) return { prepared, trigger, cadence, due: false, preflightError: null };
            const preflightError = await firstLivePreflightError(prepared.plan.nodes, row.user_id, livePreflightError);
            return { prepared, trigger, cadence, due, preflightError };
          });
          if (!gate.success) { console.warn("[AutoStudio scheduler] Saved workflow failed execution preflight.", { automationId: row.id, reason: gate.error }); failed++; continue; }
          const { prepared, trigger, cadence, due, preflightError } = gate.value;
          if (!trigger || !due) continue;
          if (preflightError) { console.warn("[AutoStudio scheduler] Scheduled workflow failed live capability preflight; no run was started.", { automationId: row.id, reason: preflightError }); failed++; continue; }
          // The fail-closed gate above guarantees this producer only queues work.
          // Keep the guard local as defense in depth; this branch never executes
          // provider actions inside the scheduler request.
          if (isDurableQueueEnabled()) {
            // Validate the generation key before claiming a lease. Invalid
            // cadence/timestamp data must not strand a queue-enqueue lease.
            let idempotencyKey: string;
            try {
              idempotencyKey = scheduledExecutionIdempotencyKey(
                row.id,
                cadence,
                row.last_run_at ? new Date(row.last_run_at) : null,
              );
            } catch {
              failed++;
              continue;
            }

            const { data: queueLock, error: queueLockError } = await supabaseAdmin.rpc("claim_scheduled_automation", {
              _automation_id: row.id,
              _lease_seconds: 900,
            });
            if (queueLockError) {
              console.error("[AutoStudio scheduler] Could not claim queue-enqueue lease.", {
                automationId: row.id,
                errorCode: queueLockError.code,
              });
              failed++;
              continue;
            }
            // A missing token without an RPC error means another scheduler owns
            // the lease; do not count normal concurrency as a failed automation.
            if (!queueLock) continue;
            // Treat the RPC payload as untrusted runtime data. A malformed lease
            // token cannot safely authorize enqueue/release operations; leave the
            // lease to expire and report the automation as failed.
            if (typeof queueLock !== "string" || queueLock.length > 200) {
              console.error("[AutoStudio scheduler] Queue-enqueue lease returned an invalid token.", {
                automationId: row.id,
              });
              failed++;
              continue;
            }

            const enqueuedAt = new Date().toISOString();
            const attempt = await runScheduledEnqueueAttempt({
              enqueue: async () => {
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
                } catch (queueError) {
                  console.error("[AutoStudio scheduler] Durable job enqueue failed.", {
                    automationId: row.id,
                    errorName: queueError instanceof Error ? queueError.name : "UnknownError",
                  });
                  throw queueError;
                }
              },
              release: async (enqueueSucceeded) => {
                // On an initial generation, a thrown enqueue can mean the queue
                // committed the job but its response was lost. Releasing with the
                // epoch fallback would change "initial" to a different idempotency
                // key and permit a duplicate. Keep this lease until expiry instead.
                if (!shouldReleaseScheduledLease({
                  enqueueSucceeded,
                  lastRunAt: row.last_run_at,
                })) {
                  console.error("[AutoStudio scheduler] Retaining first-run lease after ambiguous enqueue failure to preserve idempotency.", {
                    automationId: row.id,
                  });
                  throw new Error("Retaining initial scheduled generation until lease expiry.");
                }

                let releaseErrorCode: string | null = null;
                try {
                  const { data: releaseConfirmed, error: queueReleaseError } = await supabaseAdmin.rpc("release_scheduled_automation", {
                    _automation_id: row.id,
                    _lock_token: queueLock,
                    _last_run_at: enqueueSucceeded ? enqueuedAt : (row.last_run_at ?? "1970-01-01T00:00:00.000Z"),
                  });
                  if (!isScheduledLeaseReleaseConfirmed({ data: releaseConfirmed, error: queueReleaseError })) {
                    releaseErrorCode = queueReleaseError?.code ?? (releaseConfirmed === false ? "LEASE_NOT_OWNED" : "LEASE_RELEASE_UNCONFIRMED");
                  }
                } catch {
                  releaseErrorCode = "TRANSPORT_ERROR";
                }
                if (releaseErrorCode) {
                  console.error("[AutoStudio scheduler] Could not release queue-enqueue lease.", {
                    automationId: row.id,
                    errorCode: releaseErrorCode,
                  });
                  throw new Error("Scheduled queue lease release failed.");
                }
              },
            });
            if (attempt.enqueueSucceeded) ran++;
            // Count each automation at most once in the failure summary, even
            // when both enqueue and lease release fail during the same attempt.
            if (!attempt.enqueueSucceeded || !attempt.releaseSucceeded) failed++;
            continue;
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
