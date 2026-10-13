const SUPPORTED_SCHEDULE_CADENCES = new Set([
  "Every 5 min",
  "Hourly",
  "Daily 08:00",
  "Weekly Mon 09:00",
]);

export type NormalizedScheduledTriggerConfig = {
  cadence: string;
  timezone: string;
};

/**
 * Normalize JSON-backed schedule config at the trust boundary.
 * Unsupported cadence values are rejected rather than silently leaving a
 * live automation permanently unscheduled. Invalid/missing timezones safely
 * fall back to UTC, matching the schedule evaluator's fail-safe behavior.
 */
export function normalizeScheduledTriggerConfig(
  config: unknown,
): NormalizedScheduledTriggerConfig | null {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }

  const values = config as Record<string, unknown>;
  const cadenceValue = values["cadence"];
  const cadence = cadenceValue === undefined || cadenceValue === null
    ? "Hourly"
    : typeof cadenceValue === "string"
      ? cadenceValue
      : null;
  if (cadence === null || !SUPPORTED_SCHEDULE_CADENCES.has(cadence)) return null;

  const candidateTimezone =
    typeof values["timezone"] === "string" ? values.timezone.trim() : "";
  const timezone = candidateTimezone || "UTC";

  // Validate the IANA timezone without allowing Intl to throw in the caller.
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    return { cadence, timezone: "UTC" };
  }

  return { cadence, timezone };
}
