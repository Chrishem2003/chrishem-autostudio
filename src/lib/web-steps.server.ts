import { isIP } from "node:net";

export type WebInput = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  body?: string | undefined;
  timeoutSec: number;
};
export type WebResult = { ok: boolean; status: number; ms: number; attempts: number; detail: string };

/** Automatic retries are restricted to methods that are idempotent by HTTP semantics. */
export function isRetrySafeMethod(method: WebInput["method"]): boolean {
  return method === "GET" || method === "PUT" || method === "DELETE";
}

const MAX_REQUEST_BODY_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;

function isBlockedIPv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = parts as [number, number, number, number];
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

/** Parse an IPv6 literal to eight 16-bit groups. Invalid input returns null. */
function parseIPv6(host: string): number[] | null {
  let value = host.toLowerCase();
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    if (lastColon < 0) return null;
    const ipv4 = value.slice(lastColon + 1);
    if (isIP(ipv4) !== 4) return null;
    const octets = ipv4.split(".").map(Number);
    const hi = ((octets[0]! << 8) | octets[1]!).toString(16);
    const lo = ((octets[2]! << 8) | octets[3]!).toString(16);
    value = value.slice(0, lastColon + 1) + hi + ":" + lo;
  }

  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (
    left.some((part) => !/^[0-9a-f]{1,4}$/.test(part)) ||
    right.some((part) => !/^[0-9a-f]{1,4}$/.test(part))
  ) return null;

  const explicit = left.length + right.length;
  if ((halves.length === 1 && explicit !== 8) || (halves.length === 2 && explicit >= 8)) return null;
  const zeroCount = halves.length === 2 ? 8 - explicit : 0;
  const groups = [
    ...left.map((part) => Number.parseInt(part, 16)),
    ...Array.from({ length: zeroCount }, () => 0),
    ...right.map((part) => Number.parseInt(part, 16)),
  ];
  return groups.length === 8 ? groups : null;
}

/**
 * Only globally-routable unicast IPv6 is permitted. IPv4-mapped addresses are
 * evaluated using the IPv4 policy so ::ffff:127.0.0.1 cannot bypass the guard.
 */
function isBlockedIPv6(host: string): boolean {
  const groups = parseIPv6(host);
  if (!groups) return true;

  if (groups.slice(0, 5).every((part) => part === 0) && groups[5] === 0xffff) {
    const ipv4 = [
      groups[6]! >> 8, groups[6]! & 255, groups[7]! >> 8, groups[7]! & 255,
    ].join(".");
    return isBlockedIPv4(ipv4);
  }

  const first = groups[0]!;
  if ((first & 0xe000) !== 0x2000) return true; // not in 2000::/3 global unicast
  if (first === 0x2001 && groups[1]! <= 0x01ff) return true; // special-purpose 2001::/23
  if (first === 0x2001 && groups[1] === 0x0db8) return true; // documentation range
  if (first === 0x2002) return true; // deprecated 6to4 embeds an IPv4 destination
  return false;
}

/** Blocks local/private/special-use IP literals and local-only hostnames. */
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (
    h === "localhost" || h.endsWith(".localhost") ||
    h.endsWith(".internal") || h.endsWith(".local")
  ) return true;
  const version = isIP(h);
  if (version === 4) return isBlockedIPv4(h);
  if (version === 6) return isBlockedIPv6(h);
  if (h.includes(":")) return true; // colons are not valid in DNS hostnames; reject malformed IP literals
  return false;
}

export type PinnedAddress = { address: string; family: 4 | 6 };
type LookupAddressLike = { address: string; family: number };
type Resolver = (hostname: string, options: { all: true; verbatim: true }) => Promise<LookupAddressLike[]>;

/**
 * Resolves once, rejects the entire answer if any returned address is unsafe,
 * and returns one address that the request layer pins to for the connection.
 * The resolver is injectable for deterministic DNS-rebinding regression tests.
 */
export async function resolvePublicTarget(
  hostname: string,
  resolver?: Resolver,
): Promise<PinnedAddress> {
  const host = hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const family = isIP(host);
  if (family === 4 || family === 6) {
    if (isBlockedHost(host)) throw new Error("Private or local addresses can't be called from a flow.");
    return { address: host, family };
  }
  if (isBlockedHost(host)) throw new Error("Private or local addresses can't be called from a flow.");

  let timeout: ReturnType<typeof setTimeout> | undefined;
  let records: LookupAddressLike[];
  try {
    records = await Promise.race([
      (resolver ?? (async (name, options) => {
        const dns = await import("node:dns/promises");
        return dns.lookup(name, options);
      }))(host, { all: true, verbatim: true }),
      new Promise<LookupAddressLike[]>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("DNS resolution timed out.")), 5_000);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  if (!records.length || records.some((record) => isBlockedHost(record.address))) {
    throw new Error("The hostname resolves to a private, local, or special-use address.");
  }
  const selected = records[0]!;
  const selectedFamily = selected.family === 4 || selected.family === 6 ? selected.family : isIP(selected.address);
  if (selectedFamily !== 4 && selectedFamily !== 6) throw new Error("The hostname did not resolve to a valid IP address.");
  return { address: selected.address, family: selectedFamily };
}

function pinnedLookup(target: PinnedAddress): NonNullable<import("node:http").RequestOptions["lookup"]> {
  type Options = { all?: boolean };
  type Callback = (
    error: NodeJS.ErrnoException | null,
    address: string | LookupAddressLike[],
    family?: number,
  ) => void;
  return (( _hostname: string, options: Options, callback: Callback) => {
    if (options?.all) callback(null, [{ address: target.address, family: target.family }]);
    else callback(null, target.address, target.family);
  }) as NonNullable<import("node:http").RequestOptions["lookup"]>;
}

async function requestOnce(url: URL, data: WebInput, target: PinnedAddress): Promise<{ status: number }> {
  const requestFn = url.protocol === "https:"
    ? (await import("node:https")).request
    : (await import("node:http")).request;
  return new Promise((resolve, reject) => {
    const body = data.method !== "GET" && data.method !== "DELETE" ? data.body : undefined;
    const headers: Record<string, string> = { "user-agent": "Chrishem-AutoStudio/1.0", accept: "application/json, text/plain, */*" };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      headers["content-length"] = String(Buffer.byteLength(body));
    }
    const req = requestFn(url, {
      method: data.method,
      headers,
      lookup: pinnedLookup(target),
      signal: AbortSignal.timeout(Math.max(1, Math.min(120, data.timeoutSec)) * 1000),
    }, (res) => {
      let size = 0;
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };
      res.on("data", (chunk: Buffer | string) => {
        size += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
        if (size > MAX_RESPONSE_BYTES) {
          finish(() => reject(new Error("The remote response exceeded the 1 MB safety limit.")));
          res.destroy();
        }
      });
      res.on("end", () => finish(() => resolve({ status: res.statusCode ?? 0 })));
      res.on("error", (error) => finish(() => reject(error)));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/** Response summaries intentionally exclude remote bodies from persisted run details. */
export function summarizeWebResponse(status: number, hostname: string, retried = false): string {
  if (status >= 200 && status < 300) {
    return `${status} from ${hostname}${retried ? " (succeeded after retry)" : ""}.`;
  }
  return `${hostname} refused the request (${status}). Check the address and request settings.`;
}

export async function callWeb(data: WebInput): Promise<WebResult> {
  const started = Date.now();
  if (process.env["AUTOSTUDIO_OUTBOUND_TRANSPORT_READY"] !== "true") {
    return { ok: false, status: 0, ms: 0, attempts: 0, detail: "Outbound HTTP transport is not runtime-verified; no request was sent." };
  }
  let url: URL;
  try {
    url = new URL(data.url);
  } catch {
    return { ok: false, status: 0, ms: 0, attempts: 0, detail: "That address isn't valid." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, status: 0, ms: 0, attempts: 0, detail: "Only http/https addresses are allowed." };
  }
  if (url.username || url.password) {
    return { ok: false, status: 0, ms: 0, attempts: 0, detail: "Addresses must not contain embedded usernames or passwords." };
  }
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(data.method)) {
    return { ok: false, status: 0, ms: 0, attempts: 0, detail: "That HTTP method isn't supported." };
  }
  if (data.body && Buffer.byteLength(data.body) > MAX_REQUEST_BODY_BYTES) {
    return { ok: false, status: 0, ms: 0, attempts: 0, detail: "Request body exceeds the 64 KB safety limit." };
  }

  let target: PinnedAddress;
  try {
    target = await resolvePublicTarget(url.hostname);
  } catch (error) {
    const detail = error instanceof Error && error.message.includes("private")
      ? error.message
      : "The destination hostname could not be safely resolved.";
    return { ok: false, status: 0, ms: Date.now() - started, attempts: 0, detail };
  }

  let attempts = 0;
  let last = "The destination did not respond.";
  const retrySafe = isRetrySafeMethod(data.method);
  while (attempts < 3) {
    attempts++;
    try {
      const response = await requestOnce(url, data, target);
      if (response.status === 429 || response.status >= 500) {
        last = `Got ${response.status} from ${url.hostname}.`;
        if (!retrySafe) {
          return { ok: false, status: response.status, ms: Date.now() - started, attempts, detail: `${last} Automatic retry was suppressed because ${data.method} may have side effects.` };
        }
      } else {
        const ms = Date.now() - started;
        return response.status >= 200 && response.status < 300
          ? { ok: true, status: response.status, ms, attempts, detail: summarizeWebResponse(response.status, url.hostname, attempts > 1) }
          : { ok: false, status: response.status, ms, attempts, detail: summarizeWebResponse(response.status, url.hostname) };
      }
    } catch (error) {
      last = error instanceof Error && error.name === "TimeoutError"
        ? `No reply within ${Math.max(1, Math.min(120, data.timeoutSec))}s.`
        : error instanceof Error && error.message.includes("1 MB")
          ? error.message
          : `Couldn't reach ${url.hostname}.`;
      if (last.includes("1 MB") || !retrySafe) break;
    }
    if (attempts < 3) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempts - 1)));
  }
  return { ok: false, status: 0, ms: Date.now() - started, attempts, detail: `${last} Tried ${attempts} times — try again shortly.` };
}
