import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sanitizeExecutionError } from "@/lib/execution-error-sanitizer";
import {
  EXECUTION_QUEUE_STATUSES,
  summarizeExecutionQueueHealth,
  type ExecutionQueueHealthRow,
  type ExecutionQueueStatus,
} from "@/lib/execution-queue-health";

interface CountResult {
  count: number | null;
  error: { message: string } | null;
}
interface RowsResult {
  data: unknown[] | null;
  error: { message: string } | null;
}
interface QueueQuery {
  select(columns: string, options?: { count?: "exact"; head?: boolean }): QueueQuery;
  eq(column: string, value: string): QueueQuery;
  in(column: string, values: string[]): QueueQuery;
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
          return Response.json(summary, {
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
