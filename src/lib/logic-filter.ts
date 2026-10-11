/**
 * Small, deterministic condition evaluator for the local logic.filter node.
 * It intentionally supports a constrained expression grammar rather than eval().
 */
export type FilterResult = { ok: true; passed: boolean } | { ok: false; error: string };
const MAX_CONDITION_LENGTH = 2_000;
const QUOTED = /^(["'])([\s\S]*)\1$/;
function operand(raw: string, values?: Readonly<Record<string, string | number | boolean>>): string {
  const value = raw.trim();
  const quoted = QUOTED.exec(value);
  if (quoted) return quoted[2]!.replace(/\\(["'\\])/g, "$1");
  if (values && Object.prototype.hasOwnProperty.call(values, value)) return String(values[value]);
  return value;
}
export function validateFilterCondition(source: string): { ok: true } | { ok: false; error: string } {
  const condition = source.trim();
  if (!condition) return { ok: false, error: "Add a filter condition before running this step." };
  if (condition.length > MAX_CONDITION_LENGTH) return { ok: false, error: "The filter condition exceeds the 2,000-character limit." };
  if (/^(.+?)\s+(is empty|is not empty)$/i.test(condition)) return { ok: true };
  const match = /^(.+?)\s+(not contains|contains|==|!=|>=|<=|>|<)\s+(.+)$/i.exec(condition);
  if (!match) return { ok: false, error: 'Use a supported condition, for example: score >= 70, status == "ready", or message contains "urgent".' };
  if ([">", ">=", "<", "<="].includes(match[2]!)) {
    const right = operand(match[3]!, values);
    if (!right.trim() || !Number.isFinite(Number(right))) return { ok: false, error: "Numeric comparisons require a finite number on the right side." };
  }
  return { ok: true };
}
export function evaluateFilterCondition(source: string, values?: Readonly<Record<string, string | number | boolean>>): FilterResult {
  const condition = source.trim();
  if (!condition) return { ok: false, error: "Add a filter condition before running this step." };
  if (condition.length > MAX_CONDITION_LENGTH) return { ok: false, error: "The filter condition exceeds the 2,000-character limit." };
  const emptyMatch = /^(.+?)\s+(is empty|is not empty)$/i.exec(condition);
  if (emptyMatch) {
    const empty = operand(emptyMatch[1]!, values).length === 0;
    return { ok: true, passed: emptyMatch[2]!.toLowerCase() === "is empty" ? empty : !empty };
  }
  const match = /^(.+?)\s+(not contains|contains|==|!=|>=|<=|>|<)\s+(.+)$/i.exec(condition);
  if (!match) return { ok: false, error: 'Use a supported condition, for example: score >= 70, status == "ready", or message contains "urgent".' };
  const left = operand(match[1]!, values);
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
