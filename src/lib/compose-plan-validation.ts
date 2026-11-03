/** Pure validation for AI-proposed automation step sequences. */
export interface ComposeCandidate {
  id: string;
  kind: string;
}

export interface ComposePlanResult {
  ok: boolean;
  defIds: string[];
  rationale: string;
  error?: string;
}

export function validateComposePlan(
  plan: { defIds?: unknown; rationale?: unknown },
  candidates: readonly ComposeCandidate[],
): ComposePlanResult {
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
