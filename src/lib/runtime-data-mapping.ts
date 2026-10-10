/**
 * Resolves explicit references to outputs from already-completed steps.
 *
 * The caller must pass only outputs from earlier steps and must construct those
 * outputs from connector-specific allowlists. Arbitrary provider response bodies,
 * credentials, and nested objects are intentionally not accepted here.
 *
 * Token syntax: {{steps.<node-id>.<field-name>}}
 */
export type SafeStepOutputValue = string | number | boolean;
export type SafeStepOutput = Readonly<Record<string, SafeStepOutputValue>>;
export type PriorStepOutputs = Readonly<Record<string, SafeStepOutput>>;

export type StepConfigResolution =
  | { ok: true; config: Record<string, string> }
  | { ok: false; error: string };

const TOKEN = /\{\{steps\.([A-Za-z0-9_-]+)\.([A-Za-z][A-Za-z0-9_]*)\}\}/g;
const MAX_RESOLVED_VALUE_LENGTH = 8_000;

/**
 * Resolves config values against completed prior-step outputs. Fails closed on
 * missing references, malformed tokens, non-scalar output values, or oversized
 * resolved values. It never attempts to infer a field or stringify an object.
 */
export function resolveStepConfig(
  config: Readonly<Record<string, string>>,
  priorOutputs: PriorStepOutputs,
): StepConfigResolution {
  const resolved: Record<string, string> = Object.create(null) as Record<string, string>;

  for (const [key, rawValue] of Object.entries(config)) {
    if (typeof rawValue !== "string") {
      return { ok: false, error: `Config field "${key}" must be a string.` };
    }

    let missingReference: string | null = null;
    const value = rawValue.replace(TOKEN, (_token, nodeId: string, field: string) => {
      const output = Object.prototype.hasOwnProperty.call(priorOutputs, nodeId) ? priorOutputs[nodeId] : undefined;
      if (!output || !Object.prototype.hasOwnProperty.call(output, field)) {
        missingReference = `steps.${nodeId}.${field}`;
        return "";
      }
      const outputValue = output[field];
      if (
        typeof outputValue !== "string" &&
        typeof outputValue !== "number" &&
        typeof outputValue !== "boolean"
      ) {
        missingReference = `steps.${nodeId}.${field} (unsupported value type)`;
        return "";
      }
      return String(outputValue);
    });

    if (missingReference) {
      return { ok: false, error: `Missing or unsupported step output "${missingReference}".` };
    }
    if (value.includes("{{") || value.includes("}}")) {
      return {
        ok: false,
        error: `Config field "${key}" contains an invalid or unsupported data token.`,
      };
    }
    if (value.length > MAX_RESOLVED_VALUE_LENGTH) {
      return {
        ok: false,
        error: `Resolved config field "${key}" exceeds the ${MAX_RESOLVED_VALUE_LENGTH}-character safety limit.`,
      };
    }
    resolved[key] = value;
  }

  return { ok: true, config: resolved };
}
