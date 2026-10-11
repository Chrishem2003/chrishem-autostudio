/**
 * Keep both execution leases alive while an external provider call is pending.
 *
 * A failed heartbeat cannot reliably cancel an already-started provider request.
 * In that case, wait for the action to settle and then throw so the caller records
 * an uncertain outcome instead of claiming success or automatically replaying it.
 */
export async function runWithExecutionLeaseKeepalive<T>(
  action: () => Promise<T>,
  heartbeat: () => Promise<boolean>,
  intervalMs = 60_000,
): Promise<T> {
  if (!Number.isFinite(intervalMs) || intervalMs < 1) {
    throw new Error("Invalid execution lease heartbeat interval.");
  }

  let leaseLost = false;
  let heartbeatInFlight: Promise<void> | null = null;

  const timer = setInterval(() => {
    if (leaseLost || heartbeatInFlight) return;
    heartbeatInFlight = (async () => {
      try {
        if (await heartbeat() !== true) leaseLost = true;
      } catch {
        leaseLost = true;
      } finally {
        heartbeatInFlight = null;
      }
    })();
  }, intervalMs);

  try {
    const result = await action();
    if (heartbeatInFlight) await heartbeatInFlight;
    if (leaseLost) {
      throw new Error("Execution lease could not be maintained during the provider action; outcome requires review.");
    }
    return result;
  } catch (error) {
    if (heartbeatInFlight) await heartbeatInFlight;
    if (leaseLost) {
      throw new Error("Execution lease could not be maintained during the provider action; outcome requires review.");
    }
    throw error;
  } finally {
    clearInterval(timer);
  }
}
