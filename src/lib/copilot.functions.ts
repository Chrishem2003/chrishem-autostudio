import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const composeInputSchema = z.object({
  intent: z.string().trim().min(3, "Describe the outcome in a sentence.").max(2000),
  vertical: z.string().trim().max(80).default("general"),
  candidates: z.array(z.object({
    id: z.string().min(1).max(120),
    label: z.string().max(200),
    kind: z.string().max(80),
    tool: z.string().max(120),
    summary: z.string().max(1000),
  })).max(80).default([]),
});

export interface ComposeInput {
  intent: string;
  vertical: string;
  candidates: Array<{ id: string; label: string; kind: string; tool: string; summary: string }>;
}

export interface ComposeResult {
  ok: boolean;
  defIds: string[];
  rationale: string;
  error?: string;
}

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
const PLAN_LIMIT_PER_HOUR = 20;
const PLAN_TIMEOUT_MS = 20_000;

const planSchema = z.object({
  defIds: z.array(z.string().min(1)).min(1).max(8),
  rationale: z.string().max(500).optional().default(""),
});

/**
 * Turns a business outcome sentence into an ordered list of step ids picked from
 * the candidate catalog. Requires a signed-in user and a database-enforced quota.
 * Failure is never fatal — the client falls back to the offline planner in intent.ts.
 */
export const composeFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ComposeInput) => composeInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<ComposeResult> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false, defIds: [], rationale: "", error: "AI is not configured on this deployment." };

    // Atomic DB quota check: fails closed if the quota service is unavailable.
    const { data: usageId, error: quotaError } = await context.supabase.rpc("consume_ai_plan_quota", {
      _task: "compose_flow",
    });
    if (quotaError) {
      console.error("[AI planner] Quota check failed.");
      return { ok: false, defIds: [], rationale: "", error: "AI planner is temporarily unavailable. Please try again shortly." };
    }
    if (!usageId) {
      return { ok: false, defIds: [], rationale: "", error: "You have reached the limit of 20 automation plans per hour. Please try again later." };
    }

    const catalog = data.candidates
      .map((c) => `${c.id} | ${c.kind} | ${c.tool} | ${c.label} — ${c.summary}`)
      .join("\n");

    const prompt = [
      `Business outcome: "${data.intent}"`,
      `Industry section: ${data.vertical}`,
      "",
      "Available steps (id | kind | tool | label — summary):",
      catalog,
      "",
      "Design the shortest reliable pipeline that achieves the outcome.",
      "Rules: exactly one trigger first, then logic/ai/action steps in execution order, 3-8 steps total, use only ids from the list.",
      'Reply with JSON only: {"defIds":["..."],"rationale":"one short sentence"}',
    ].join("\n");

    try {
      const res = await fetch(GATEWAY, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
        body: JSON.stringify({
          model: "openai/gpt-6-astra",
          input: [
            {
              role: "system",
              content: "You are an automation architect. You answer with strict JSON and nothing else.",
            },
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(PLAN_TIMEOUT_MS),
      });

      if (!res.ok) {
        return { ok: false, defIds: [], rationale: "", error: `AI planner unavailable (${res.status}).` };
      }

      const bodyText = await res.text();
      const parsed = JSON.parse(bodyText) as {
        output_text?: string;
        output?: Array<{ content?: Array<{ text?: string; type?: string }> }>;
        usage?: { total_tokens?: number; input_tokens?: number; output_tokens?: number };
      };
      const modelText =
        parsed.output_text ??
        (parsed.output ?? [])
          .flatMap((o) => o.content ?? [])
          .map((c) => c.text ?? "")
          .join("");

      const firstBrace = modelText.indexOf("{");
      const lastBrace = modelText.lastIndexOf("}");
      if (firstBrace < 0 || lastBrace < firstBrace) {
        return { ok: false, defIds: [], rationale: "", error: "AI returned an invalid plan. Please try again." };
      }

      const parsedPlan = planSchema.safeParse(JSON.parse(modelText.slice(firstBrace, lastBrace + 1)));
      if (!parsedPlan.success) {
        return { ok: false, defIds: [], rationale: "", error: "AI returned an invalid plan. Please try again." };
      }

      const allowed = new Set(data.candidates.map((c) => c.id));
      const defIds = [...new Set(parsedPlan.data.defIds.filter((id) => allowed.has(id)))].slice(0, 8);
      if (defIds.length === 0) {
        return { ok: false, defIds: [], rationale: "", error: "AI returned no usable steps." };
      }

      // Meter usage server-side; do not let metering failure leak secrets or discard a valid plan.
      const tokens = Math.max(0, Math.floor(
        parsed.usage?.total_tokens ??
        ((parsed.usage?.input_tokens ?? 0) + (parsed.usage?.output_tokens ?? 0))
      ));
      if (tokens > 0) {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("ai_usage").update({ tokens }).eq("id", usageId);
        } catch {
          console.error("[AI planner] Token metering update failed.");
        }
      }

      return { ok: true, defIds, rationale: parsedPlan.data.rationale };
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      return {
        ok: false,
        defIds: [],
        rationale: "",
        error: timedOut
          ? "AI planning took too long. Please try again."
          : "AI planning failed. Please try again.",
      };
    }
  });
