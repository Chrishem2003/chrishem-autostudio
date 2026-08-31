import { createServerFn } from "@tanstack/react-start";

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

/**
 * Turns a business outcome sentence into an ordered list of step ids picked from
 * the candidate catalog. Failure is never fatal — the client falls back to the
 * offline planner in `intent.ts`.
 */
export const composeFlow = createServerFn({ method: "POST" })
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
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false, defIds: [], rationale: "", error: "AI is not configured on this deployment." };

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
          model: "openai/gpt-5.6-sol",
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
      const allowed = new Set(data.candidates.map((c) => c.id));
      const defIds = Array.isArray(plan.defIds)
        ? plan.defIds.filter((id): id is string => typeof id === "string" && allowed.has(id)).slice(0, 8)
        : [];
      if (defIds.length === 0) return { ok: false, defIds: [], rationale: "", error: "AI returned no usable steps." };
      return { ok: true, defIds, rationale: typeof plan.rationale === "string" ? plan.rationale : "" };
    } catch (err) {
      return {
        ok: false,
        defIds: [],
        rationale: "",
        error: err instanceof Error ? err.message : "AI planner failed.",
      };
    }
  });
