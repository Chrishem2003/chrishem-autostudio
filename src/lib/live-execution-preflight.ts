/** Shared live-capability preflight for every execution entry point. */
export async function firstLivePreflightError<T>(
  nodes: readonly T[],
  userId: string,
  check: (node: T, userId: string) => Promise<string | null>,
): Promise<string | null> {
  for (const node of nodes) {
    const reason = await check(node, userId);
    if (reason) return reason;
  }
  return null;
}
