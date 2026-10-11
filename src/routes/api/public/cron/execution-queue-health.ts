import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sanitizeExecutionError } from "@/lib/execution-error-sanitizer";
import {
  EXECUTION_QUEUE_STATUSES,
  summarizeExecutionQueueHealth,
  summarizeExpiredExecutionLeases,
  type ExecutionQueueHealthRow,
  type ExecutionQueueStatus,
} from "@/lib/execution-queue-health";
import { findExecutionAuditConsistencyIssues } from "@/lib/execution-audit-consistency";

interface CountResult {
  count: number | null;
  error: { message: string } | null;
}
interface RowsResult {
  data: unknown[] | null;
  error: { message: string } | null;
}
interface AuditQuery {
  select(columns: string, options?: { count?: "exact"; head?: boolean }): AuditQuery;
  in(column: string, values: string[]): AuditQuery;
  order(column: string, options: { ascending: boolean }): AuditQuery;
  limit(value: number): Promise<RowsResult>;
}
interface QueueQuery {
  select(columns: string, options?: { count?: "exact"; head?: boolean }): QueueQuery;
  eq(column: string, value: string): QueueQuery;
  in(column: string, values: string[]): QueueQuery;
  lte(column: string, value: string): QueueQuery;
  order(column: string, options: { ascending: boolean }): QueueQuery;
  limit(value: number): Promise<RowsResult>;
  then<TResult1 = CountResult, TResult2 = never>(
    onfulfilled?: ((value: CountResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}

/**
 * Internal monitoring endpoint. Cron-secret authentication is intentional:
 * the queue table is service-role-only and this endpoint never returns payloads,
 * idempotency keys, automation/user IDs, or raw provider errors.
 */
export const Route = createFileRoute("/api/public/cron/execution-queue-health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        try {
          // The durable queue migration is newer than the generated Supabase
          // Database type snapshot, so isolate that temporary typing gap here.
          const fromQueue = () => supabaseAdmin.from("execution_jobs" as never) as unknown as QueueQuery;
          const countEntries = await Promise.all(EXECUTION_QUEUE_STATUSES.map(async (status) => {
            const result = await fromQueue().select("id", { count: "exact", head: true }).eq("status", status);
            if (result.error) throw new Error("Queue status counts unavailable.");
            return [status, result.count ?? 0] as const;
          }));
          const counts = Object.fromEntries(countEntries) as Record<ExecutionQueueStatus, number>;

          const oldestQueuedResult = await fromQueue()
            .select("status, attempts, max_attempts, available_at, created_at, updated_at, last_error, trigger_type")
            .eq("status", "queued")
            .order("created_at", { ascending: true })
            .limit(1);
          if (oldestQueuedResult.error) throw new Error("Queue age unavailable.");

          const failuresResult = await fromQueue()
            .select("status, attempts, max_attempts, available_at, created_at, updated_at, last_error, trigger_type")
            .in("status", ["failed", "needs_review", "dead_letter"])
            .order("updated_at", { ascending: false })
            .limit(10);
          if (failuresResult.error) throw new Error("Recent failure summary unavailable.");

          const rows = [
            ...(oldestQueuedResult.data ?? []),
            ...(failuresResult.data ?? []),
          ] as ExecutionQueueHealthRow[];
          const summary = summarizeExecutionQueueHealth(
            counts,
            rows,
            new Date().toISOString(),
            sanitizeExecutionError,
          );

          // A bounded, read-only consistency snapshot helps operators spot
          // queue/audit drift without exposing workflow payloads or mutating history.
          const jobsResult = await fromQueue()
            .select("id, status, run_id")
            .in("status", [...EXECUTION_QUEUE_STATUSES])
            .order("updated_at", { ascending: false })
            .limit(100);
          if (jobsResult.error) throw new Error("Audit consistency snapshot unavailable.");

          const jobs = (jobsResult.data ?? []) as Array<{
            id: string;
            status: (typeof EXECUTION_QUEUE_STATUSES)[number];
            run_id: string | null;
          }>;
          const runIds = [...new Set(jobs.flatMap((job) => job.run_id ? [job.run_id] : []))];
          let auditRuns: Array<{ id: string; status: string }> = [];
          if (runIds.length > 0) {
            const auditClient = supabaseAdmin.from("run_logs" as never) as unknown as AuditQuery;
            const runsResult = await auditClient
              .select("id, status")
              .in("id", runIds)
              .limit(100);
            if (runsResult.error) throw new Error("Audit run snapshot unavailable.");
            auditRuns = (runsResult.data ?? []) as Array<{ id: string; status: string }>;
          }

          const findings = findExecutionAuditConsistencyIssues(jobs, auditRuns);

          // Expired leases are reported, never reset here: a lease timeout can
          // mean an external side effect happened but its acknowledgement was lost.
          const expiredLeaseCutoff = new Date().toISOString();
          const expiredLeaseCountResult = await fromQueue()
            .select("id", { count: "exact", head: true })
            .eq("status", "running")
            .lte("locked_until", expiredLeaseCutoff);
          if (expiredLeaseCountResult.error) throw new Error("Expired lease count unavailable.");

          const expiredLeaseResult = await fromQueue()
            .select("id, locked_until, updated_at, attempts, max_attempts")
            .eq("status", "running")
            .lte("locked_until", expiredLeaseCutoff)
            .order("locked_until", { ascending: true })
            .limit(100);
          if (expiredLeaseResult.error) throw new Error("Expired lease snapshot unavailable.");
          const expiredLeases = (expiredLeaseResult.data ?? []) as Array<{
            id: string;
            locked_until: string;
            updated_at: string;
            attempts: number;
            max_attempts: number;
          }>;
          const expiredLeaseSummary = summarizeExpiredExecutionLeases(
            expiredLeaseCountResult.count ?? expiredLeases.length,
            expiredLeases,
          );

          const consistency = {
            sampledJobs: jobs.length,
            findingCount: findings.length,
            countsByIssue: Object.fromEntries(
              [...new Set(findings.map((finding) => finding.issue))].map((issue) => [
                issue,
                findings.filter((finding) => finding.issue === issue).length,
              ]),
            ),
            sample: findings.slice(0, 20),
          };
          return Response.json({ ...summary, consistency, expiredLeases: expiredLeaseSummary }, {
            headers: {
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch (error) {
          console.error("[AutoStudio queue health] Monitoring query failed.", {
            message: error instanceof Error ? error.message : "unknown",
          });
          return Response.json({ error: "Execution queue health is temporarily unavailable." }, {
            status: 503,
            headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
          });
        }
      },
    },
  },
});
