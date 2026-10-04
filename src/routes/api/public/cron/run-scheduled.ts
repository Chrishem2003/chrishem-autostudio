import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { isDue } from "@/lib/schedule";
import { callWeb } from "@/lib/web-steps.server";
import { orderedNodes, type Workflow } from "@/lib/workflow";

export const Route = createFileRoute("/api/public/cron/run-scheduled")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rows, error } = await supabaseAdmin
          .from("automations")
          .select("id, flow_json, last_run_at, workspace_id")
          .eq("status", "live")
          .limit(500);
        if (error) return new Response("query failed", { status: 500 });
        const now = new Date();
        let ran = 0;
        for (const row of rows ?? []) {
          const wf = row.flow_json as unknown as Workflow | null;
          if (!wf?.nodes) continue;
          const trig = wf.nodes.find((n) => n.defId === "trigger.schedule");
          if (!trig) continue;
          const cadence = trig.config?.["cadence"] || "Hourly";
          if (!isDue(cadence, row.last_run_at ? new Date(row.last_run_at) : null, now, trig.config?.["timezone"])) continue;
          ran++;
          const started = Date.now();
          const steps: { label: string; status: "success" | "failed" | "dry_run"; ms: number; detail: string; nodeId: string }[] = [];
          let halted = false;
          for (const n of orderedNodes(wf)) {
            if (halted) break;
            const url = n.config?.["url"]?.trim();
            if ((n.defId === "action.http" || n.defId === "output.webhook") && url) {
              let r;
              try {
                r = await callWeb({
                  method: (n.defId === "output.webhook" ? "POST" : n.config["method"] || "GET") as "GET",
                  url,
                  body: n.config["body"] || (n.defId === "output.webhook" ? JSON.stringify({ flow: wf.name, sentAt: now.toISOString() }) : undefined),
                  timeoutSec: Math.min(60, Math.max(1, Number(n.config["timeout"]) || 30)),
                });
              } catch {
                r = { ok: false, ms: 0, detail: "That address isn't valid." };
              }
              steps.push({ nodeId: n.id, label: n.name, status: r.ok ? "success" : "failed", ms: r.ms, detail: r.detail });
              if (!r.ok) halted = true;
            } else {
              steps.push({ nodeId: n.id, label: n.name, status: n.defId === "trigger.schedule" ? "success" : "dry_run", ms: 0, detail: n.defId === "trigger.schedule" ? `Started on schedule (${cadence}).` : "Practice step — this app isn't connected for real yet." });
            }
          }
          const failed = steps.some((s) => s.status === "failed");
          const { data: run } = await supabaseAdmin
            .from("run_logs")
            .insert({
              automation_id: row.id,
              workspace_id: row.workspace_id,
              trigger_type: "schedule",
              is_dry_run: !steps.some((s) => s.status === "success" && s.nodeId !== trig.id),
              status: failed ? "failed" : "success",
              started_at: new Date(started).toISOString(),
              finished_at: new Date().toISOString(),
              duration_ms: Date.now() - started,
              error_summary: failed ? steps.find((s) => s.status === "failed")!.detail.slice(0, 500) : null,
            })
            .select("id")
            .single();
          if (run) {
            await supabaseAdmin.from("run_step_logs").insert(
              steps.map((s, i) => ({
                run_id: run.id,
                workspace_id: row.workspace_id,
                step_index: i,
                node_id: s.nodeId,
                node_label: s.label.slice(0, 160),
                status: s.status,
                duration_ms: s.ms,
                error_detail: s.status === "failed" ? s.detail.slice(0, 500) : null,
                output_snapshot: s.status !== "failed" ? { detail: s.detail.slice(0, 500) } : null,
              })),
            );
          }
          await supabaseAdmin.from("automations").update({ last_run_at: now.toISOString() }).eq("id", row.id);
        }
        return Response.json({ checked: rows?.length ?? 0, ran });
      },
    },
  },
});
