const SECRETISH_KEY = /(secret|token|key|password|authorization|bearer|credential|cookie|session)/i;
const URL_PATTERN = /\bhttps?:\/\/[^\s"'<>]+/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_PATTERN = /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/gi;
const SECRET_ASSIGNMENT = /\b(?:authorization|access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|password|passwd|secret|credential)\b\s*[:=]\s*[^\s,;]+/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const MAX_DEPTH = 6;
const MAX_COLLECTION_ITEMS = 50;
const MAX_STRING_LENGTH = 500;

/**
 * Minimize run output before it is persisted. Redaction is recursive because
 * provider output often nests credentials inside data/headers/metadata objects.
 */
export function sanitizeRunOutput(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    return value
      .slice(0, MAX_STRING_LENGTH)
      .replace(BEARER_PATTERN, "[REDACTED_AUTH]")
      .replace(JWT_PATTERN, "[REDACTED_TOKEN]")
      .replace(SECRET_ASSIGNMENT, "[REDACTED_SECRET]")
      .replace(URL_PATTERN, "[REDACTED_URL]")
      .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]");
  }
  if (typeof value !== "object") return "[omitted]";
  if (depth >= MAX_DEPTH) return "[MAX_DEPTH]";
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_COLLECTION_ITEMS).map((item) => sanitizeRunOutput(item, depth + 1));
    if (value.length > MAX_COLLECTION_ITEMS) items.push("[TRUNCATED]");
    return items;
  }

  const output: Record<string, unknown> = {};
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [key, nested] of entries.slice(0, MAX_COLLECTION_ITEMS)) {
    output[key.slice(0, 120)] = SECRETISH_KEY.test(key)
      ? "[redacted]"
      : sanitizeRunOutput(nested, depth + 1);
  }
  if (entries.length > MAX_COLLECTION_ITEMS) output["[truncated]"] = true;
  return output;
}
