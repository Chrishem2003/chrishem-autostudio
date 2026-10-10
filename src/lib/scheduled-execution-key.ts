const SUPPORTED_CADENCES = new Set([
  "Every 5 min",
  "Hourly",
  "Daily 08:00",
  "Weekly Mon 09:00",
]);

function localDateKey(date: Date, timezone: string): string {
  let zone = timezone || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(date);
  } catch {
    zone = "UTC";
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/**
 * Stable key for one scheduled occurrence. It is deliberately independent of
 * the cron invocation timestamp within an occurrence window so concurrent or
 * repeated scheduler calls cannot enqueue duplicate work for that occurrence.
 */
export function scheduledExecutionIdempotencyKey(
  automationId: string,
  cadence: string,
  now: Date,
  timezone = "UTC",
): string {
  const id = automationId.trim();
  if (!id || id.length > 100) throw new Error("Invalid automation ID.");
  if (!SUPPORTED_CADENCES.has(cadence)) throw new Error("Unsupported schedule cadence.");
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid schedule timestamp.");

  let occurrence: string;
  switch (cadence) {
    case "Every 5 min":
      occurrence = String(Math.floor(now.getTime() / (5 * 60_000)));
      break;
    case "Hourly":
      occurrence = String(Math.floor(now.getTime() / (60 * 60_000)));
      break;
    case "Daily 08:00":
    case "Weekly Mon 09:00":
      occurrence = localDateKey(now, timezone);
      break;
  }
  return `scheduled:${id}:${cadence}:${occurrence}`;
}
