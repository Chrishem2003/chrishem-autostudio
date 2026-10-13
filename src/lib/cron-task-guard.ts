/**
 * Shared guard for cron-backed tasks. The task callback is intentionally lazy:
 * unauthorized requests must not construct dependencies or touch queue/database
 * adapters before authentication succeeds.
 */
export async function runCronTaskAfterAuthentication<T>(
  request: Request,
  authenticate: (request: Request) => Promise<Response | null>,
  task: () => Promise<T>,
): Promise<{ denied: Response; result?: never } | { denied?: never; result: T }> {
  const denied = await authenticate(request);
  if (denied) {
    const headers = new Headers(denied.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("Pragma", "no-cache");
    headers.set("X-Content-Type-Options", "nosniff");
    return { denied: new Response(denied.body, { status: denied.status, statusText: denied.statusText, headers }) };
  }
  return { result: await task() };
}
