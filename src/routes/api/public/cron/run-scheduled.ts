import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueExecutionJob } from "@/lib/execution-job-queue.server";
import { isDurableQueueEnabled } from "@/lib/runtime-feature-gates";
import { preparePersistedExecutionPlan } from "@/lib/prepare-execution-plan";
import { isDue } from "@/lib/schedule";
import { scheduledExecutionIdempotencyKey } from "@/lib/scheduled-execution-key";

/**
 * Scheduler producer only: validate persisted workflow data, then enqueue.
 * It must never invoke a provider directly. The separately protected durable
 * worker revalidates the workflow and live capabilities before execution.
 */
export const Route = createFileRoute("/api/public/cron/run-scheduled")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        // Fail closed before reading/processing automations while queue rollout
        // is disabled. This endpoint must not fall back to inline execution.
        if (!isDurableQueueEnabled()) {
          return Response.json(
            { error: "Scheduled execution queue is disabled by rollout policy." },
            { status: 503 },
          );
        }

        const { data: rows, error } = await supabaseAdmin
          .from("automations")
          .select("id, flow_json, last_run_at, workspace_id")
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

          const cadenceValue = trigger.config?.["cadence"];
          const cadence = typeof cadenceValue === "string" ? cadenceValue : "Hourly";
          const timezoneValue = trigger.config?.["timezone"];
          const timezone = typeof timezoneValue === "string" ? timezoneValue : "UTC";
          if (!isDue(cadence, row.last_run_at ? new Date(row.last_run_at) : null, now, timezone)) continue;

          let idempotencyKey: string;
          try {
            idempotencyKey = scheduledExecutionIdempotencyKey(row.id, cadence, now, timezone);
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
                scheduledAt: now.toISOString(),
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
      },
    },
  },
});
