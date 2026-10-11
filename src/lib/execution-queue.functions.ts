import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizeExecutionError } from "@/lib/execution-error-sanitizer";

export const listMyExecutionQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = supabaseAdmin as unknown as {
      from(table: string): {
        select(columns: string, options?: { count?: "exact"; head?: boolean }): any;
      };
    };
    const statuses = ["queued", "running", "succeeded", "failed", "needs_review", "dead_letter"] as const;
    const entries = await Promise.all(statuses.map(async (status) => {
      const { count, error } = await client.from("execution_jobs")
        .select("id", { count: "exact", head: true })
        .eq("requested_by", context.userId)
        .eq("status", status);
      if (error) throw new Error("Could not load execution queue counts.");
      return [status, count ?? 0] as const;
    }));
    const { data, error } = await client.from("execution_jobs")
      .select("id, status, attempts, max_attempts, available_at, created_at, updated_at, last_error, trigger_type")
      .eq("requested_by", context.userId)
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw new Error("Could not load your recent execution jobs.");
    const jobs = ((data ?? []) as Array<{
      id: string; status: typeof statuses[number]; attempts: number; max_attempts: number;
      available_at: string; created_at: string; updated_at: string; last_error: string | null; trigger_type: string;
    }>).map((job) => ({
      id: job.id,
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.max_attempts,
      availableAt: job.available_at,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      triggerType: job.trigger_type,
      error: job.last_error ? sanitizeExecutionError(job.last_error, "Failure details are unavailable.") : null,
    }));
    return {
      counts: Object.fromEntries(entries) as Record<typeof statuses[number], number>,
      sampledAt: new Date().toISOString(),
      jobs,
    };
  });
