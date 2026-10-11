/**
 * Small, deterministic condition evaluator for the local logic.filter node.
 * It intentionally supports a constrained expression grammar rather than eval().
 */
export type FilterResult = { ok: true; passed: boolean } | { ok: false; error: string };
const MAX_CONDITION_LENGTH = 2_000;
const QUOTED = /^(["'])([\s\S]*)\1$/;
function operand(raw: string): string {
  const value = raw.trim();
  const quoted = QUOTED.exec(value);
  return quoted ? quoted[2]!.replace(/\\(["'\\])/g, "$1") : value;
}
export function evaluateFilterCondition(source: string): FilterResult {
  const condition = source.trim();
  if (!condition) return { ok: false, error: "Add a filter condition before running this step." };
  if (condition.length > MAX_CONDITION_LENGTH) return { ok: false, error: "The filter condition exceeds the 2,000-character limit." };
  const emptyMatch = /^(.+?)\s+(is empty|is not empty)$/i.exec(condition);
  if (emptyMatch) {
    const empty = operand(emptyMatch[1]!).length === 0;
    return { ok: true, passed: emptyMatch[2]!.toLowerCase() === "is empty" ? empty : !empty };
  }
  const match = /^(.+?)\s+(not contains|contains|==|!=|>=|<=|>|<)\s+(.+)$/i.exec(condition);
  if (!match) return { ok: false, error: 'Use a supported condition, for example: score >= 70, status == "ready", or message contains "urgent".' };
  const left = operand(match[1]!);
  const operator = match[2]!.toLowerCase();
  const right = operand(match[3]!);
  if (operator === "==" || operator === "!=") {
    const equal = left === right;
    return { ok: true, passed: operator === "==" ? equal : !equal };
  }
  if (operator === "contains" || operator === "not contains") {
    const contains = left.toLocaleLowerCase().includes(right.toLocaleLowerCase());
    return { ok: true, passed: operator === "contains" ? contains : !contains };
  }
  const a = Number(left), b = Number(right);
  if (!left.trim() || !right.trim() || !Number.isFinite(a) || !Number.isFinite(b)) return { ok: false, error: "Numeric comparisons require two finite numbers, for example: score >= 70." };
  if (operator === ">") return { ok: true, passed: a > b };
  if (operator === ">=") return { ok: true, passed: a >= b };
  if (operator === "<") return { ok: true, passed: a < b };
  return { ok: true, passed: a <= b };
}
