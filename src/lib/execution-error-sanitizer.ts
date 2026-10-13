const SECRET_ASSIGNMENT = /\b(?:authorization|access[_-]?token|refresh[_-]?token|token|api[_-]?key|private[_-]?key|signing[_-]?key|client[_-]?secret|password|passwd|secret|credential|session[_-]?id|cookie)\b\s*[:=]\s*[^\s,;]+/gi;
const BEARER_TOKEN = /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const URL_WITH_QUERY = /https?:\/\/[^\s"'<>]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

/**
 * Bound and redact untrusted provider/runtime error text before it reaches
 * durable audit records. A fallback is always safe, static operator guidance.
 */
export function sanitizeExecutionError(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  let sanitized = value
    .replace(BEARER_TOKEN, "[REDACTED_AUTH]")
    .replace(JWT, "[REDACTED_TOKEN]")
    .replace(SECRET_ASSIGNMENT, "[REDACTED_SECRET]")
    .replace(URL_WITH_QUERY, "[REDACTED_URL]")
    .replace(EMAIL, "[REDACTED_EMAIL]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 500);
  if (!sanitized || /\[REDACTED_(?:AUTH|TOKEN|SECRET|URL|EMAIL)\]/.test(sanitized) && sanitized.replace(/\[REDACTED_(?:AUTH|TOKEN|SECRET|URL|EMAIL)\]/g, "").trim().length === 0) {
    return fallback;
  }
  return sanitized;
}


const SENSITIVE_OUTPUT_KEY = /(?:authorization|access[_-]?token|refresh[_-]?token|token|api[_-]?key|private[_-]?key|signing[_-]?key|client[_-]?secret|password|passwd|secret|credential|session[_-]?id|cookie)/i;

/**
 * Redacts sensitive fields in persisted workflow output snapshots. Output data
 * is untrusted and can be nested or unexpectedly large, so traversal is bounded.
 */
export function sanitizeExecutionAuditValue(value: unknown): unknown {
  const seen = new WeakSet<object>();
  let visited = 0;

  const visit = (item: unknown, depth: number, key?: string): unknown => {
    visited += 1;
    if (visited > 500) return "[TRUNCATED]";
    if (key && SENSITIVE_OUTPUT_KEY.test(key)) return "[REDACTED_SECRET]";
    if (typeof item === "string") {
      if (!item.trim()) return item;
      return sanitizeExecutionError(item, "[REDACTED_VALUE]");
    }
    if (item === null || typeof item === "boolean") return item;
    if (typeof item === "number") return Number.isFinite(item) ? item : null;
    if (typeof item !== "object") return "[UNSUPPORTED_VALUE]";
    if (depth >= 6) return "[TRUNCATED]";
    if (seen.has(item)) return "[CIRCULAR]";
    seen.add(item);

    if (Array.isArray(item)) {
      return item.slice(0, 50).map((entry) => visit(entry, depth + 1));
    }

    // A null-prototype dictionary treats keys such as `__proto__` as data,
    // not as mutators of the returned object's prototype.
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [childKey, childValue] of Object.entries(item).slice(0, 50)) {
      result[childKey.slice(0, 100)] = visit(childValue, depth + 1, childKey);
    }
    return result;
  };

  try {
    return visit(value, 0);
  } catch {
    // Proxies and accessor properties are untrusted runtime input. A malformed
    // object must not abort the workflow while audit data is being sanitized.
    return "[UNAVAILABLE]";
  }
}
