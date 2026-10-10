const SECRET_ASSIGNMENT = /\\b(?:authorization|access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|password|passwd|secret|credential)\\b\\s*[:=]\\s*[^\\s,;]+/gi;
const BEARER_TOKEN = /\\b(?:Bearer|Basic)\\s+[A-Za-z0-9._~+/=-]+/gi;
const URL_WITH_QUERY = /https?:\\/\\/[^\\s"'<>]+/gi;
const JWT = /\\beyJ[A-Za-z0-9_-]{8,}\\.eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\b/g;
const EMAIL = /\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b/gi;

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
    .replace(/[\\r\\n\\t]+/g, " ")
    .replace(/\\s{2,}/g, " ")
    .trim()
    .slice(0, 500);
  if (!sanitized || /\\[REDACTED_(?:AUTH|TOKEN|SECRET|URL|EMAIL)\\]/.test(sanitized) && sanitized.replace(/\\[REDACTED_(?:AUTH|TOKEN|SECRET|URL|EMAIL)\\]/g, "").trim().length === 0) {
    return fallback;
  }
  return sanitized;
}
