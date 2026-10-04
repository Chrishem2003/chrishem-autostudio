/** Decides whether a scheduled flow is due. The checker runs every 5 minutes. */
function localParts(now: Date, tz: string) {
  let zone = tz || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    zone = "UTC";
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { weekday: get("weekday"), hour: Number(get("hour")) % 24, minute: Number(get("minute")) };
}

export function isDue(cadence: string, lastRunAt: Date | null, now: Date, tz = "UTC"): boolean {
  const since = lastRunAt ? now.getTime() - lastRunAt.getTime() : Infinity;
  const MIN = 60_000;
  switch (cadence) {
    case "Every 5 min":
      return since >= 4.5 * MIN;
    case "Hourly":
      return since >= 55 * MIN;
    case "Daily 08:00": {
      const p = localParts(now, tz);
      return p.hour === 8 && p.minute < 5 && since >= 60 * MIN;
    }
    case "Weekly Mon 09:00": {
      const p = localParts(now, tz);
      return p.weekday === "Mon" && p.hour === 9 && p.minute < 5 && since >= 60 * MIN;
    }
    default:
      return false;
  }
}
