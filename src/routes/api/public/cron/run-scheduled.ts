import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import {
  authenticateCronRequestSafely,
  runCronTaskWithFallback,
  withCronSecurityHeaders,
} from "@/lib/cron-task-guard";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueExecutionJob } from "@/lib/execution-job-queue.server";
import { isDurableQueueEnabled } from "@/lib/runtime-feature-gates";
import { preparePersistedExecutionPlan } from "@/lib/prepare-execution-plan";
import { isDue } from "@/lib/schedule";
import { scheduledExecutionIdempotencyKey } from "@/lib/scheduled-execution-key";
import { firstLivePreflightError } from "@/lib/live-execution-preflight";
import { normalizeScheduledTriggerConfig } from "@/lib/scheduled-trigger-config";
import { livePreflightError } from "@/lib/execute-step.server";
import { parseStaleExecutionRunReferences } from "@/lib/stale-execution-run-references";
import { isSafeStaleRunReconciliationResult } from "@/lib/stale-run-reconciliation-result";

/**
 * Scheduler producer only: validate persisted workflow data, then enqueue.
 * It must never invoke a provider directly. The separately protected durable
 * worker revalidates the workflow and live capabilities before execution.
 */
export const Route = createFileRoute("/api/public/cron/run-scheduled")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const response = await runCronTaskWithFallback(async () => {
        const denied = await authenticateCronRequestSafely(request, authenticateCronRequest);
        if (denied !== null) return denied;

        // Fail closed before reading/processing automations while queue rollout
        // is disabled. This endpoint must not fall back to inline execution.
        if (!isDurableQueueEnabled()) {
          return Response.json(
            { error: "Scheduled execution queue is disabled by rollout policy." },
            { status: 503 },
          );
        }

        // Reconcile abandoned manual/scheduled runs before enqueuing new work.
        // The RPC locks the automation parent, rechecks the lease with a fresh
        // clock, and marks unfinished step intents uncertain; it never replays.
        const staleBefore = new Date(Date.now() - 20 * 60 * 1000).toISOString();
        const { data: staleRuns, error: staleQueryError } = await supabaseAdmin
          .from("run_logs")
          .select("id")
          .eq("status", "running")
          .in("trigger_type", ["manual", "schedule"])
          .lt("started_at", staleBefore)
          .order("started_at", { ascending: true })
          .limit(100);
        if (staleQueryError) {
          return Response.json(
            { error: "Stale-run reconciliation is temporarily unavailable." },
            { status: 503 },
          );
        }
        const staleRunReferences = parseStaleExecutionRunReferences(staleRuns);
        if (!staleRunReferences.success) {
          return Response.json(
            { error: "Stale-run reconciliation is temporarily unavailable." },
            { status: 503 },
          );
        }
        for (const stale of staleRunReferences.runs) {
          const { data: recoveryResult, error: recoveryError } = await supabaseAdmin.rpc(
            "reconcile_stale_execution_run",
            { _run_id: stale.id, _lock_token: null },
          );
          if (recoveryError || !isSafeStaleRunReconciliationResult(recoveryResult)) {
            return Response.json(
              { error: "Stale-run reconciliation is temporarily unavailable." },
              { status: 503 },
            );
          }
        }

        const { data: rows, error } = await supabaseAdmin
          .from("automations")
          .select("id, user_id, flow_json, last_run_at, workspace_id")
          .eq("status", "live")
          .limit(500);

        if (error) return new Response("query failed", { status: 500 });

        const now = new Date();
        let checked = 0;
        let enqueued = 0;
        let skippedInvalid = 0;
        let enqueueFailures = 0;

        for (const row of rows ?? []) {
          checked++;
          const prepared = preparePersistedExecutionPlan(row.flow_json);
          if (!prepared.success) {
            skippedInvalid++;
            continue;
          }

          const trigger = prepared.workflow.nodes.find((node) => node.defId === "trigger.schedule");
          if (!trigger) continue;

          const normalizedConfig = normalizeScheduledTriggerConfig(trigger.config);
          if (!normalizedConfig) {
            skippedInvalid++;
            continue;
          }
          const { cadence, timezone } = normalizedConfig;
          if (!isDue(cadence, row.last_run_at ? new Date(row.last_run_at) : null, now, timezone)) continue;

          // Avoid queueing jobs that cannot pass current live capability checks.
          // The worker repeats this preflight immediately before any provider action.
          const preflightError = await firstLivePreflightError(
            prepared.plan.nodes,
            row.user_id,
            livePreflightError,
          );
          if (preflightError) {
            skippedInvalid++;
            continue;
          }

          let idempotencyKey: string;
          try {
            idempotencyKey = scheduledExecutionIdempotencyKey(
              row.id,
              cadence,
              row.last_run_at ? new Date(row.last_run_at) : null,
            );
          } catch {
            skippedInvalid++;
            continue;
          }

          try {
            await enqueueExecutionJob({
              automationId: row.id,
              triggerType: "scheduled",
              idempotencyKey,
              payload: {
                source: "scheduler",
                cadence,
              },
              requestedBy: null,
            });
          } catch {
            // Do not advance last_run_at when enqueue failed. A later scheduler
            // tick may safely retry the same logical occurrence.
            enqueueFailures++;
            continue;
          }

          const { error: updateError } = await supabaseAdmin
            .from("automations")
            .update({ last_run_at: now.toISOString() })
            .eq("id", row.id);
          if (updateError) {
            // The stable occurrence key makes a repeated scheduler call safe
            // even if the last-run marker could not be persisted.
            enqueueFailures++;
            continue;
          }
          enqueued++;
        }

        return Response.json({ checked, enqueued, skippedInvalid, enqueueFailures });
        }, () => new Response("Scheduled execution is temporarily unavailable.", { status: 503 }));
        return withCronSecurityHeaders(response);
      },
    },
  },
});
