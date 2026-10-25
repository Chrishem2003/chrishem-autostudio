import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

/** Validate model output against the workflow contract; prompts alone are not a safety boundary. */
function validateComposePlan(
  plan: { defIds?: unknown; rationale?: unknown },
  candidates: ComposeInput["candidates"],
): ComposeResult {
  if (!Array.isArray(plan.defIds) || plan.defIds.length < 3 || plan.defIds.length > 8) {
    return { ok: false, defIds: [], rationale: "", error: "AI returned a plan outside the 3–8 step limit." };
  }
  if (plan.defIds.some((id) => typeof id !== "string")) {
    return { ok: false, defIds: [], rationale: "", error: "AI returned invalid workflow step identifiers." };
  }
  const ids = plan.defIds as string[];
  if (new Set(ids).size !== ids.length) {
    return { ok: false, defIds: [], rationale: "", error: "AI returned duplicate workflow steps." };
  }
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const selected = ids.map((id) => byId.get(id));
  if (selected.some((candidate) => !candidate)) {
    return { ok: false, defIds: [], rationale: "", error: "AI selected a step outside the available catalog." };
  }
  const kinds = selected.map((candidate) => candidate!.kind.trim().toLowerCase());
  if (kinds[0] !== "trigger" || kinds.filter((kind) => kind === "trigger").length !== 1) {
    return { ok: false, defIds: [], rationale: "", error: "A valid workflow must start with exactly one trigger." };
  }
  return {
    ok: true,
    defIds: ids,
    rationale: typeof plan.rationale === "string" ? plan.rationale.slice(0, 500) : "",
  };
}

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";

/**
 * Turns a business outcome sentence into an ordered list of step ids picked from
 * the candidate catalog. Failure is never fatal — the client falls back to the
 * offline planner in `intent.ts`.
 */
export const composeFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ComposeInput) => {
    if (!input || typeof input.intent !== "string" || input.intent.trim().length < 3) {
      throw new Error("Describe the outcome in a sentence.");
    }
    return {
      intent: input.intent.slice(0, 2000),
      vertical: String(input.vertical ?? "general"),
      candidates: (input.candidates ?? []).slice(0, 80),
    };
  })
  .handler(async ({ data }): Promise<ComposeResult> => {
    const catalog = data.candidates.slice(0, 40)
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

    // When configured, use the shared governed gateway as the only remote AI
    // provider for this request. Never silently fall back to another provider.
    const sharedGateway = process.env["SHARED_AI_API_URL"]?.replace(/\/+$/, "");
    if (sharedGateway) {
      const authorization = getRequest()?.headers.get("authorization");
      if (!authorization?.startsWith("Bearer ")) {
        return { ok: false, defIds: [], rationale: "", error: "A signed-in session is required for the shared AI gateway." };
      }
      try {
        const res = await fetch(sharedGateway + "/api/v1/ai/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authorization },
          body: JSON.stringify({ product: "auto_studio", task: "compose_flow", input: prompt }),
        });
        if (!res.ok) {
          return { ok: false, defIds: [], rationale: "", error: "Shared AI gateway unavailable (" + res.status + "); no alternate provider was called." };
        }
        const response = (await res.json()) as { output?: unknown };
        const text = typeof response.output === "string" ? response.output : "";
        const jsonSlice = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
        if (!jsonSlice || !jsonSlice.startsWith("{")) {
          return { ok: false, defIds: [], rationale: "", error: "Shared AI returned no valid workflow plan." };
        }
        const plan = JSON.parse(jsonSlice) as { defIds?: unknown; rationale?: unknown };
        return validateComposePlan(plan, data.candidates);
      } catch {
        return { ok: false, defIds: [], rationale: "", error: "Shared AI gateway could not be reached; no alternate provider was called." };
      }
    }

    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false, defIds: [], rationale: "", error: "AI is not configured on this deployment." };

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
      });

      const bodyText = await res.text();
      if (!res.ok) {
        return { ok: false, defIds: [], rationale: "", error: `AI planner unavailable (${res.status}).` };
      }

      const parsed = JSON.parse(bodyText) as {
        output_text?: string;
        output?: Array<{ content?: Array<{ text?: string; type?: string }> }>;
      };
      const text =
        parsed.output_text ??
        (parsed.output ?? [])
          .flatMap((o) => o.content ?? [])
          .map((c) => c.text ?? "")
          .join("");

      const jsonSlice = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
      const plan = JSON.parse(jsonSlice) as { defIds?: unknown; rationale?: unknown };
      return validateComposePlan(plan, data.candidates);
    } catch (err) {
      return {
        ok: false,
        defIds: [],
        rationale: "",
        error: err instanceof Error ? err.message : "AI planner failed.",
      };
    }
  });
