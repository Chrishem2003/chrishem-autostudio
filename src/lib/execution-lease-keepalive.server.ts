/**
 * Keep both execution leases alive while an external provider call is pending.
 *
 * A failed heartbeat cannot reliably cancel an already-started provider request.
 * In that case, wait for the action to settle and then throw so the caller records
 * an uncertain outcome instead of claiming success or automatically replaying it.
 *
 * Heartbeat requests are bounded independently of provider execution. A stalled
 * database/network request must not pin the worker forever or silently prevent
 * subsequent lease checks; a timeout is treated as lost ownership.
 */
/**
 * Confirm lease ownership at an adapter boundary. Transport exceptions and
 * malformed/truthy responses are not evidence that a lease remains valid.
 */
export async function confirmExecutionLeaseHeartbeat(
  heartbeat: () => Promise<unknown>,
): Promise<boolean> {
  try {
    return (await heartbeat()) === true;
  } catch {
    return false;
  }
}

export async function runWithExecutionLeaseKeepalive<T>(
  action: () => Promise<T>,
  heartbeat: () => Promise<boolean>,
  intervalMs = 60_000,
  heartbeatTimeoutMs = 15_000,
): Promise<T> {
  if (!Number.isFinite(intervalMs) || intervalMs < 1) {
    throw new Error("Invalid execution lease heartbeat interval.");
  }
  if (!Number.isFinite(heartbeatTimeoutMs) || heartbeatTimeoutMs < 1) {
    throw new Error("Invalid execution lease heartbeat timeout.");
  }

  let leaseLost = false;
  let heartbeatInFlight: Promise<void> | null = null;

  const boundedHeartbeat = async (): Promise<boolean> => {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([
        Promise.resolve()
          .then(heartbeat)
          .then((alive) => alive === true, () => false),
        new Promise<boolean>((resolve) => {
          timeoutHandle = setTimeout(() => resolve(false), heartbeatTimeoutMs);
        }),
      ]);
      return outcome === true;
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }
  };

  const timer = setInterval(() => {
    if (leaseLost || heartbeatInFlight) return;
    heartbeatInFlight = (async () => {
      try {
        if (await boundedHeartbeat() !== true) leaseLost = true;
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
