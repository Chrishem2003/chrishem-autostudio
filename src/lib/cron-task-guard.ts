/** Apply conservative cache/content-type headers to every cron response. */
export function withCronSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Normalize runtime authentication adapter results. Only literal null means
 * authorization succeeded; malformed values and thrown adapters fail closed.
 */
export async function authenticateCronRequestSafely(
  request: Request,
  authenticate: (request: Request) => Promise<Response | null>,
): Promise<Response | null> {
  let result: unknown;
  try {
    result = await authenticate(request);
  } catch {
    return withCronSecurityHeaders(
      Response.json({ error: "Cron task is temporarily unavailable." }, { status: 503 }),
    );
  }

  if (result === null) return null;
  try {
    // A malformed runtime adapter can return a Proxy that throws during the
    // instanceof/prototype check, or a Response-shaped object that throws while
    // its headers/body are inspected. Treat both as adapter failure, not as an
    // uncaught route error or an authorization result.
    if (result instanceof Response) return withCronSecurityHeaders(result);
  } catch {
    // Fall through to the same generic fail-closed response used for bad values.
  }
  return withCronSecurityHeaders(
    Response.json({ error: "Cron task is temporarily unavailable." }, { status: 503 }),
  );
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
  const denied = await authenticateCronRequestSafely(request, authenticate);
  if (denied !== null) return { denied };
  return { result: await task() };
}

/** Catch unexpected cron task failures without returning raw transport/provider details. */
export async function runCronTaskWithFallback<T>(
  task: () => Promise<T>,
  fallback: (error: unknown) => T,
): Promise<T> {
  try {
    return await task();
  } catch (error) {
    return fallback(error);
  }
}
