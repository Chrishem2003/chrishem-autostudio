import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Cloud persistence for the studio. Every save writes an immutable version row
 * so history is never overwritten and any point can be restored.
 */

const workflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  vertical: z.string(),
  live: z.boolean(),
  updatedAt: z.number(),
  nodes: z.array(
    z.object({
      id: z.string(),
      defId: z.string(),
      x: z.number(),
      y: z.number(),
      name: z.string(),
      config: z.record(z.string(), z.string()),
    }),
  ),
  edges: z.array(z.object({ id: z.string(), from: z.string(), to: z.string() })),
});

export type CloudWorkflow = z.infer<typeof workflowSchema>;

export interface CloudAutomation {
  id: string;
  name: string;
  description: string | null;
  vertical: string | null;
  status: "draft" | "live" | "paused";
  version: number;
  healthScore: number;
  lastRunAt: string | null;
  updatedAt: string;
  flow: CloudWorkflow | null;
}

function toAutomation(row: {
  id: string;
  name: string;
  description: string | null;
  vertical: string | null;
  status: "draft" | "live" | "paused";
  version: number;
  health_score: number;
  last_run_at: string | null;
  updated_at: string;
  flow_json: unknown;
}): CloudAutomation {
  const parsed = workflowSchema.safeParse(row.flow_json);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    vertical: row.vertical,
    status: row.status,
    version: row.version,
    healthScore: row.health_score,
    lastRunAt: row.last_run_at,
    updatedAt: row.updated_at,
    flow: parsed.success ? parsed.data : null,
  };
}

export const listAutomations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CloudAutomation[]> => {
    const { data, error } = await context.supabase
      .from("automations")
      .select(
        "id, name, description, vertical, status, version, health_score, last_run_at, updated_at, flow_json",
      )
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toAutomation);
  });

export const saveAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        automationId: z.string().uuid().optional(),
        flow: workflowSchema,
        description: z.string().max(500).optional(),
        status: z.enum(["draft", "live", "paused"]).optional(),
        changeSummary: z.string().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<{ automationId: string; version: number }> => {
    const flow = data.flow as unknown as Record<string, unknown>;
    let automationId = data.automationId;
    let version = 1;

    if (automationId) {
      const { data: existing, error: readErr } = await context.supabase
        .from("automations")
        .select("version")
        .eq("id", automationId)
        .maybeSingle();
      if (readErr) throw new Error(readErr.message);
      if (!existing) throw new Error("That flow no longer exists.");
      version = existing.version + 1;
      const { error } = await context.supabase
        .from("automations")
        .update({
          name: data.flow.name,
          vertical: data.flow.vertical,
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.status ? { status: data.status } : {}),
          version,
          flow_json: flow,
        })
        .eq("id", automationId);
      if (error) throw new Error(error.message);
    } else {
      const { data: created, error } = await context.supabase
        .from("automations")
        .insert({
          user_id: context.userId,
          name: data.flow.name,
          vertical: data.flow.vertical,
          ...(data.description !== undefined ? { description: data.description } : {}),
          status: data.status ?? "draft",
          version: 1,
          flow_json: flow,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      automationId = created.id;
    }

    const { error: versionErr } = await context.supabase.from("automation_versions").insert({
      automation_id: automationId,
      version_number: version,
      flow_json: flow,
      created_by: context.userId,
      change_summary: data.changeSummary ?? null,
    });
    if (versionErr) throw new Error(versionErr.message);

    return { automationId, version };
  });

export const deleteAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ automationId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("automations").delete().eq("id", data.automationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setAutomationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ automationId: z.string().uuid(), status: z.enum(["draft", "live", "paused"]) })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("automations")
      .update({ status: data.status })
      .eq("id", data.automationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export interface CloudVersion {
  id: string;
  versionNumber: number;
  changeSummary: string | null;
  createdAt: string;
  flow: CloudWorkflow | null;
}

export const listVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ automationId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }): Promise<CloudVersion[]> => {
    const { data: rows, error } = await context.supabase
      .from("automation_versions")
      .select("id, version_number, change_summary, created_at, flow_json")
      .eq("automation_id", data.automationId)
      .order("version_number", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => {
      const parsed = workflowSchema.safeParse(r.flow_json);
      return {
        id: r.id,
        versionNumber: r.version_number,
        changeSummary: r.change_summary,
        createdAt: r.created_at,
        flow: parsed.success ? parsed.data : null,
      };
    });
  });

/** Restoring writes the old flow forward as a brand-new version. */
export const restoreVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ automationId: z.string().uuid(), versionNumber: z.number().int().positive() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { data: snapshot, error } = await context.supabase
      .from("automation_versions")
      .select("flow_json")
      .eq("automation_id", data.automationId)
      .eq("version_number", data.versionNumber)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!snapshot) throw new Error("That saved version is gone.");

    const { data: current, error: curErr } = await context.supabase
      .from("automations")
      .select("version")
      .eq("id", data.automationId)
      .maybeSingle();
    if (curErr) throw new Error(curErr.message);
    const nextVersion = (current?.version ?? 1) + 1;

    const { error: upErr } = await context.supabase
      .from("automations")
      .update({ flow_json: snapshot.flow_json, version: nextVersion })
      .eq("id", data.automationId);
    if (upErr) throw new Error(upErr.message);

    const { error: insErr } = await context.supabase.from("automation_versions").insert({
      automation_id: data.automationId,
      version_number: nextVersion,
      flow_json: snapshot.flow_json,
      created_by: context.userId,
      change_summary: `Restored version ${data.versionNumber}`,
    });
    if (insErr) throw new Error(insErr.message);

    return { version: nextVersion };
  });

export interface CloudRun {
  id: string;
  automationId: string;
  status: string;
  triggerType: string | null;
  isDryRun: boolean;
  startedAt: string;
  durationMs: number | null;
  errorSummary: string | null;
  steps: Array<{
    id: string;
    label: string | null;
    status: string;
    durationMs: number | null;
    errorDetail: string | null;
    output: unknown;
  }>;
}

export const listRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CloudRun[]> => {
    const { data, error } = await context.supabase
      .from("run_logs")
      .select(
        "id, automation_id, status, trigger_type, is_dry_run, started_at, duration_ms, error_summary, run_step_logs(id, node_label, status, duration_ms, error_detail, output_snapshot, step_index)",
      )
      .order("started_at", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      automationId: r.automation_id,
      status: r.status,
      triggerType: r.trigger_type,
      isDryRun: r.is_dry_run,
      startedAt: r.started_at,
      durationMs: r.duration_ms,
      errorSummary: r.error_summary,
      steps: [...(r.run_step_logs ?? [])]
        .sort((a, b) => a.step_index - b.step_index)
        .map((s) => ({
          id: s.id,
          label: s.node_label,
          status: s.status,
          durationMs: s.duration_ms,
          errorDetail: s.error_detail,
          output: s.output_snapshot,
        })),
    }));
  });

const SECRETISH = /(secret|token|key|password|authorization|bearer|credential)/i;

/** Never persist anything that looks like a credential. */
function redact(value: Record<string, unknown> | undefined) {
  if (!value) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = SECRETISH.test(k) ? "[redacted]" : v;
  return out;
}

export const recordRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        automationId: z.string().uuid(),
        triggerType: z.string().max(80).optional(),
        isDryRun: z.boolean().default(false),
        steps: z
          .array(
            z.object({
              label: z.string().max(160),
              status: z.enum(["success", "failed", "halted", "dry_run"]),
              durationMs: z.number().int().nonnegative(),
              detail: z.string().max(500).optional(),
              output: z.record(z.string(), z.unknown()).optional(),
            }),
          )
          .max(200),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const failed = data.steps.find((s) => s.status === "failed" || s.status === "halted");
    const duration = data.steps.reduce((sum, s) => sum + s.durationMs, 0);

    const { data: run, error } = await context.supabase
      .from("run_logs")
      .insert({
        automation_id: data.automationId,
        status: failed ? "failed" : data.isDryRun ? "dry_run" : "success",
        trigger_type: data.triggerType ?? "manual",
        is_dry_run: data.isDryRun,
        finished_at: new Date().toISOString(),
        duration_ms: duration,
        error_summary: failed ? `${failed.label}: ${failed.detail ?? "step failed"}` : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (data.steps.length) {
      const { error: stepErr } = await context.supabase.from("run_step_logs").insert(
        data.steps.map((s, i) => ({
          run_id: run.id,
          step_index: i,
          node_label: s.label,
          status: s.status,
          duration_ms: s.durationMs,
          error_detail: s.detail ?? null,
          output_snapshot: redact(s.output) as never,
        })),
      );
      if (stepErr) throw new Error(stepErr.message);
    }

    // Health score: recent success rate over the last 20 runs.
    const { data: recent } = await context.supabase
      .from("run_logs")
      .select("status")
      .eq("automation_id", data.automationId)
      .order("started_at", { ascending: false })
      .limit(20);
    const rows = recent ?? [];
    const ok = rows.filter((r) => r.status === "success" || r.status === "dry_run").length;
    const health = rows.length ? Math.round((ok / rows.length) * 100) : 100;

    await context.supabase
      .from("automations")
      .update({ last_run_at: new Date().toISOString(), health_score: health })
      .eq("id", data.automationId);

    return { runId: run.id, health };
  });

export interface CloudIntegration {
  id: string;
  provider: string;
  accountLabel: string | null;
  authKind: string;
  status: "connected" | "needs_reauth" | "revoked" | "error";
  scopes: string[];
  lastVerifiedAt: string | null;
}

export const listIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CloudIntegration[]> => {
    const { data, error } = await context.supabase
      .from("integrations")
      .select("id, provider, account_label, auth_kind, status, scopes, last_verified_at")
      .order("provider");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      provider: r.provider,
      accountLabel: r.account_label,
      authKind: r.auth_kind,
      status: r.status,
      scopes: r.scopes ?? [],
      lastVerifiedAt: r.last_verified_at,
    }));
  });

export const connectIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        provider: z.string().min(1).max(80),
        accountLabel: z.string().max(160).optional(),
        authKind: z.enum(["oauth2", "apiKey", "basic", "none"]).default("oauth2"),
        scopes: z.array(z.string().max(80)).max(30).default([]),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("integrations").upsert(
      {
        user_id: context.userId,
        provider: data.provider,
        display_name: data.provider,
        account_label: data.accountLabel ?? null,
        auth_kind: data.authKind,
        status: "connected",
        scopes: data.scopes,
        last_verified_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const verifyIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ integrationId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("integrations")
      .update({ status: "connected", last_verified_at: new Date().toISOString() })
      .eq("id", data.integrationId);
    if (error) throw new Error(error.message);
    return { ok: true, verifiedAt: new Date().toISOString() };
  });

export const disconnectIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ integrationId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("integrations").delete().eq("id", data.integrationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
