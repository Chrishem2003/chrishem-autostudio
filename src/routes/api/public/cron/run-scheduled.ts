import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { isDue } from "@/lib/schedule";
import { orderedNodes, type Workflow } from "@/lib/workflow";
import { executeStep } from "@/lib/execute-step.server";

const MAX_SCHEDULED_FLOW_RUNTIME_MS = 4 * 60 * 1000;

export const Route = createFileRoute("/api/public/cron/run-scheduled")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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

          ran++;
          const started = Date.now();
          const steps: Array<{
            nodeId: string;
            label: string;
            status: "success" | "failed" | "dry_run";
            ms: number;
            detail: string;
          }> = [];

          for (const node of orderedNodes(wf)) {
            if (steps.some((step) => step.status === "failed")) break;
            if (Date.now() - started >= MAX_SCHEDULED_FLOW_RUNTIME_MS) {
              steps.push({
                nodeId: node.id,
                label: node.name.slice(0, 160),
                status: "failed",
                ms: 0,
                detail: "Scheduled flow exceeded its four-minute execution budget. Remaining steps were halted.",
              });
              break;
            }
            try {
              const result = await executeStep({
                node,
                flowName: wf.name || row.name,
                userId: row.user_id,
                mode: "live",
              });
              steps.push(result);
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
                detail: "The step failed unexpectedly. Check the connection and run details before retrying.",
              });
            }
          }

          const hasFailure = steps.some((step) => step.status === "failed");
          if (hasFailure) failed++;
          const finishedAt = new Date().toISOString();
          const { data: run, error: runError } = await supabaseAdmin
            .from("run_logs")
            .insert({
              automation_id: row.id,
              workspace_id: row.workspace_id,
              trigger_type: "schedule",
              is_dry_run: false,
              status: hasFailure ? "failed" : "success",
              started_at: new Date(started).toISOString(),
              finished_at: finishedAt,
              duration_ms: Date.now() - started,
              error_summary: hasFailure ? steps.find((step) => step.status === "failed")!.detail.slice(0, 500) : null,
            })
            .select("id")
            .single();

          if (runError) {
            console.error("[AutoStudio scheduler] Could not persist run summary.", {
              automationId: row.id,
              errorCode: runError.code,
            });
          } else if (run && steps.length) {
            const { error: stepError } = await supabaseAdmin.from("run_step_logs").insert(
              steps.map((step, index) => ({
                run_id: run.id,
                workspace_id: row.workspace_id,
                step_index: index,
                node_id: step.nodeId,
                node_label: step.label.slice(0, 160),
                status: step.status,
                duration_ms: step.ms,
                error_detail: step.status === "failed" ? step.detail.slice(0, 500) : null,
                output_snapshot: { detail: step.detail.slice(0, 500) },
              })),
            );
            if (stepError) {
              console.error("[AutoStudio scheduler] Could not persist step events.", {
                automationId: row.id,
                runId: run.id,
                errorCode: stepError.code,
              });
            }
          }

          // Release only our own lease and advance the cadence cursor even after failure.
          const { data: released, error: releaseError } = await supabaseAdmin.rpc("release_scheduled_automation", {
            _automation_id: row.id,
            _lock_token: lockToken,
            _last_run_at: finishedAt,
          });
          if (releaseError || !released) {
            console.error("[AutoStudio scheduler] Could not release scheduled-flow lease.", {
              automationId: row.id,
              errorCode: releaseError?.code ?? "LEASE_NOT_OWNED",
            });
          }
        }

        return Response.json({ checked: rows?.length ?? 0, ran, failed, finishedAt: now.toISOString() });
      },
    },
  },
});
