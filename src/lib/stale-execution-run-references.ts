export interface StaleExecutionRunReference { id: string; }

export type StaleExecutionRunReferencesResult =
  | { success: true; runs: StaleExecutionRunReference[] }
  | { success: false; error: string };

/** A malformed query result must not be mistaken for an empty stale-run set. */
export function parseStaleExecutionRunReferences(value: unknown): StaleExecutionRunReferencesResult {
  if (!Array.isArray(value)) return { success: false, error: "Stale-run query returned an invalid row collection." };
  const runs: StaleExecutionRunReference[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return { success: false, error: "Stale-run query returned an invalid row." };
    let id: unknown;
    try { id = (row as Record<string, unknown>)["id"]; } catch { return { success: false, error: "Stale-run query returned an unreadable row." }; }
    if (typeof id !== "string" || !id.trim() || id.length > 200) return { success: false, error: "Stale-run query returned an invalid run identifier." };
    runs.push({ id });
  }
  return { success: true, runs };
}
