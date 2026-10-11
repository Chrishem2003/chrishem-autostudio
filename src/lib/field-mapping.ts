/**
 * Deterministic, side-effect-free field mapping for the workflow's logic.map node.
 * Values are plain text after the shared runtime token resolver has run.
 */
export type FieldMappingResult =
  | { ok: true; fields: Record<string, string>; serialized: string }
  | { ok: false; error: string };

const KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const MAX_FIELDS = 50;
const MAX_SERIALIZED_BYTES = 8_000;

export function mapFields(source: string): FieldMappingResult {
  if (!source.trim()) return { ok: false, error: "Add at least one mapping as field_name = value." };
  const fields: Record<string, string> = Object.create(null) as Record<string, string>;
  const lines = source.split(/\r?\n/);
  if (lines.length > MAX_FIELDS) return { ok: false, error: `A mapping can contain at most ${MAX_FIELDS} fields.` };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) return { ok: false, error: `Line ${index + 1} must use field_name = value.` };
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!KEY.test(key)) return { ok: false, error: `Line ${index + 1} has an invalid field name. Use letters, numbers and underscores; start with a letter.` };
    if (Object.prototype.hasOwnProperty.call(fields, key)) return { ok: false, error: `Field "${key}" is mapped more than once.` };
    if (value.length > 2_000) return { ok: false, error: `Value for "${key}" exceeds the 2,000-character limit.` };
    fields[key] = value;
  }

  if (Object.keys(fields).length === 0) return { ok: false, error: "Add at least one mapping as field_name = value." };
  const serialized = JSON.stringify(fields);
  if (new TextEncoder().encode(serialized).byteLength > MAX_SERIALIZED_BYTES) {
    return { ok: false, error: "The mapped output exceeds the 8 KB safety limit." };
  }
  return { ok: true, fields, serialized };
}
