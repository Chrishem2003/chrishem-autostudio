import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";

async function ask(prompt: string): Promise<string | null> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return null;
  try {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        input: [
          { role: "system", content: "You are a senior automation support engineer. Be specific, short, practical." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) return null;
    const parsed = (await res.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
    };
    return (
      parsed.output_text ??
      (parsed.output ?? []).flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("")
    ).trim() || null;
  } catch {
    return null;
  }
}

/** "Explain this failure" — scoped to one run, fed only redacted step logs. */
export const explainFailure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ runId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: run, error } = await context.supabase
      .from("run_logs")
      .select("status, trigger_type, error_summary, run_step_logs(node_label, status, error_detail, output_snapshot, step_index)")
      .eq("id", data.runId)
      .single();
    if (error || !run) throw new Error("Run not found.");
    const steps = [...(run.run_step_logs ?? [])].sort((a, b) => a.step_index - b.step_index);
    const failed = steps.find((s) => s.status === "failed" || s.status === "halted");
    const log = steps
      .map((s) => `${s.step_index + 1}. ${s.node_label} — ${s.status}${s.error_detail ? ` — ${s.error_detail}` : ""} — output: ${JSON.stringify(s.output_snapshot ?? {}).slice(0, 300)}`)
      .join("\n");
    const answer = await ask(
      `A workflow run ended with status "${run.status}". Summary: ${run.error_summary ?? "none"}.\nSteps:\n${log}\n\nIn 2-4 sentences: say exactly which step broke and why, then give the one concrete fix the user should make in the studio. No generic advice.`,
    );
    if (answer) return { explanation: answer, source: "ai" as const };
    return {
      explanation: failed
        ? `"${failed.node_label}" stopped the run${failed.error_detail ? `: ${failed.error_detail}` : ""}. Open the flow, check that step's fields are filled and its app account is connected, then dry-run again.`
        : "Every step finished — nothing failed in this run.",
      source: "offline" as const,
    };
  });
