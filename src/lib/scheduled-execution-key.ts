const SUPPORTED_CADENCES = new Set([
  "Every 5 min",
  "Hourly",
  "Daily 08:00",
  "Weekly Mon 09:00",
]);

/**
 * Stable key for the current scheduled generation. The last-run marker is the
 * generation token: repeated/concurrent producer calls share a key, and a
 * successful marker update naturally opens the next generation. This avoids
 * collapsing two valid hourly runs into the same wall-clock hour.
 */
export function scheduledExecutionIdempotencyKey(
  automationId: string,
  cadence: string,
  lastRunAt: Date | null,
): string {
  const id = automationId.trim();
  if (!id || id.length > 100) throw new Error("Invalid automation ID.");
  if (!SUPPORTED_CADENCES.has(cadence)) throw new Error("Unsupported schedule cadence.");
  if (lastRunAt !== null && !Number.isFinite(lastRunAt.getTime())) {
    throw new Error("Invalid last-run timestamp.");
  }

  const generation = lastRunAt ? lastRunAt.toISOString() : "initial";
  return `scheduled:${id}:${cadence}:${generation}`;
}
