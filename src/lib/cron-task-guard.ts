/** Apply conservative cache/content-type headers to every cron response. */
export function withCronSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

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
  let denied: Response | null;
  try {
    denied = await authenticate(request);
  } catch {
    // Authentication adapter failures are not authorization successes. Return a
    // generic, cache-safe failure and never construct or run the protected task.
    return {
      denied: withCronSecurityHeaders(
        Response.json({ error: "Cron task is temporarily unavailable." }, { status: 503 }),
      ),
    };
  }
  // Runtime adapters can violate their TypeScript contract. Only literal null
  // is an authorization success; only an actual Response is a valid denial.
  // Any malformed value fails closed before the protected task is constructed.
  if (denied !== null) {
    if (denied instanceof Response) {
      return { denied: withCronSecurityHeaders(denied) };
    }
    return {
      denied: withCronSecurityHeaders(
        Response.json({ error: "Cron task is temporarily unavailable." }, { status: 503 }),
      ),
    };
  }
  return { result: await task() };
}
