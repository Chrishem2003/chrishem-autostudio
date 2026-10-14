export const STALE_RUN_RECONCILIATION_RESULTS = [
  "reconciled",
  "not_running",
  "not_stale",
  "active_lease",
] as const;

export type StaleRunReconciliationResult = typeof STALE_RUN_RECONCILIATION_RESULTS[number];

/**
 * RPC data is untrusted runtime input. Only documented outcomes may let the
 * scheduler continue; do not coerce objects or arbitrary values to strings.
 */
export function isSafeStaleRunReconciliationResult(value: unknown): value is StaleRunReconciliationResult {
  return typeof value === "string" &&
    (STALE_RUN_RECONCILIATION_RESULTS as readonly string[]).includes(value);
}
