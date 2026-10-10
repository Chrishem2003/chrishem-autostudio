import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validate, type Workflow } from "@/lib/workflow";
import { livePreflightError } from "@/lib/execute-step.server";

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
      .eq("user_id", context.userId)
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
        status: z.enum(["draft", "paused"]).optional(),
        changeSummary: z.string().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<{ automationId: string; version: number }> => {
    const flow = data.flow as unknown as import("@/integrations/supabase/types").Json;
    let automationId = data.automationId;
    let version = 1;

    if (automationId) {
      const { data: existing, error: readErr } = await context.supabase
        .from("automations")
        .select("version, status")
        .eq("id", automationId)
        .eq("user_id", context.userId)
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
          status: data.status ?? (existing.status === "live" ? "paused" : existing.status),
          version,
          flow_json: flow,
        })
        .eq("id", automationId)
        .eq("user_id", context.userId);
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
    const { error } = await context.supabase.from("automations").delete().eq("id", data.automationId).eq("user_id", context.userId);
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
    const { data: automation, error: readError } = await context.supabase
      .from("automations")
      .select("id, user_id, status, flow_json, updated_at")
      .eq("id", data.automationId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (readError) throw new Error("Could not load the saved automation.");
    if (!automation) throw new Error("Automation not found.");

    if (data.status === "live") {
      const parsed = workflowSchema.safeParse(automation.flow_json);
      if (!parsed.success) throw new Error("The saved flow is invalid. Fix and save it before enabling live execution.");
      const flow = parsed.data as unknown as Workflow;
      const issues = validate(flow);
      const blocking = issues.filter((issue) => issue.level === "error" || issue.level === "warn");
      if (blocking.length) throw new Error(`Fix the flow before going live: ${blocking[0]!.message}`);

      for (const node of flow.nodes) {
        const reason = await livePreflightError(node, context.userId);
        if (reason) throw new Error(reason);
      }

      // A dry preflight must have passed against this saved version before enabling scheduling.
      const { data: preflight, error: preflightError } = await context.supabase
        .from("run_logs")
        .select("id")
        .eq("automation_id", data.automationId)
        .eq("is_dry_run", true)
        .eq("status", "dry_run")
        .gte("started_at", automation.updated_at)
        .order("started_at", { ascending: false })
        .limit(1);
      if (preflightError) throw new Error("Could not verify the latest preflight run.");
      if (!preflight?.length) {
        throw new Error("Run a successful Preview after your last save before enabling this flow. Preview does not send messages or call external APIs.");
      }
    }

    const { error } = await context.supabase
      .from("automations")
      .update({ status: data.status })
      .eq("id", data.automationId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true, status: data.status };
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
      .eq("user_id", context.userId)
      .maybeSingle();
    if (curErr) throw new Error(curErr.message);
    const nextVersion = (current?.version ?? 1) + 1;

    const { error: upErr } = await context.supabase
      .from("automations")
      .update({ flow_json: snapshot.flow_json, version: nextVersion, status: "paused" })
      .eq("id", data.automationId)
      .eq("user_id", context.userId);
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
    output: import("@/integrations/supabase/types").Json | null;
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

function redactText(value: string): string {
  return value
    .replace(/\\b(Bearer\\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]")
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|client[_-]?secret|authorization)\\s*[:=]\\s*)[^\\s,;]+/gi, "$1[redacted]")
    .replace(/([?&](?:token|key|secret|password|access_token)=)[^&\\s]+/gi, "$1[redacted]")
    .slice(0, 500);
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRETISH.test(key) ? "[redacted]" : redactValue(item);
    }
    return out;
  }
  return value;
}

/** Never persist fields or text that look like credentials. */
function redact(value: Record<string, unknown> | undefined) {
  return value ? redactValue(value) : null;
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
    const { data: ownedAutomation, error: ownershipError } = await context.supabase
      .from("automations")
      .select("id")
      .eq("id", data.automationId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (ownershipError) throw new Error("Could not verify automation ownership.");
    if (!ownedAutomation) throw new Error("Automation not found.");

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
        error_summary: failed ? redactText(`${failed.label}: ${failed.detail ?? "step failed"}`) : null,
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
          error_detail: s.detail ? redactText(s.detail) : null,
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
      .eq("id", data.automationId)
      .eq("user_id", context.userId);

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
      .eq("user_id", context.userId)
      .order("provider");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      provider: r.provider,
      accountLabel: r.account_label,
      authKind: r.auth_kind,
      // No generic connector manifest exists yet, so legacy metadata cannot be represented as verified.
      status: r.status === "connected" ? "error" : r.status,
      scopes: r.scopes ?? [],
      lastVerifiedAt: r.status === "connected" ? null : r.last_verified_at,
    }));
  });

/**
 * Generic metadata-only connection records are not proof of provider access.
 * Until a reviewed manifest exists, fail closed rather than mark an app connected.
 */
export const connectIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      provider: z.string().min(1).max(80),
      accountLabel: z.string().max(160).optional(),
      authKind: z.enum(["oauth2", "apiKey", "basic", "none"]).default("oauth2"),
      scopes: z.array(z.string().max(80)).max(30).default([]),
    }).parse(input),
  )
  .handler(async ({ data }) => ({
    ok: false as const,
    status: "error" as const,
    provider: data.provider,
    message: "This catalog entry has no reviewed connector manifest and successful provider verification yet. It remains Test only and was not marked connected.",
  }));

export const verifyIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ integrationId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: integration, error } = await context.supabase
      .from("integrations")
      .select("provider")
      .eq("id", data.integrationId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error("Could not load the integration.");
    if (!integration) throw new Error("Integration not found.");
    return {
      ok: false as const,
      status: "error" as const,
      provider: integration.provider,
      message: "No real verify() adapter is registered for this provider yet. The connection remains unverified.",
    };
  });

export const disconnectIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ integrationId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: integ } = await context.supabase
      .from("integrations").select("provider").eq("id", data.integrationId).eq("user_id", context.userId).maybeSingle();
    const { error } = await context.supabase.from("integrations").delete().eq("id", data.integrationId).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    // Scoped revocation: pause only the live flows that use this app.
    let paused: string[] = [];
    if (integ?.provider) {
      const { NODES } = await import("./automation-catalog");
      const provider = integ.provider.toLowerCase();
      const { data: autos } = await context.supabase
        .from("automations").select("id, name, flow_json").eq("status", "live").eq("user_id", context.userId);
      const hit = (autos ?? []).filter((a) => {
        const nodes = ((a.flow_json as { nodes?: Array<{ defId: string }> } | null)?.nodes ?? []);
        return nodes.some((n) => NODES[n.defId]?.tool.toLowerCase() === provider);
      });
      if (hit.length) {
        await context.supabase.from("automations").update({ status: "paused" }).in("id", hit.map((a) => a.id));
        paused = hit.map((a) => a.name);
      }
    }
    return { ok: true, paused };
  });
