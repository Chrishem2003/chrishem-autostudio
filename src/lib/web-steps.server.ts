import { isIP } from "node:net";

export type WebInput = { method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; url: string; body?: string | undefined; timeoutSec: number };
export type WebResult = { ok: boolean; status: number; ms: number; attempts: number; detail: string };

function isBlockedIPv4(host: string): boolean {
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return true;
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2) || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function parseIPv6(host: string): number[] | null {
  let value = host.toLowerCase();
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    const ipv4 = value.slice(lastColon + 1);
    if (isIP(ipv4) !== 4) return null;
    const octets = ipv4.split(".").map(Number);
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    value = value.slice(0, lastColon + 1) + hi + ":" + lo;
  }

  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (left.some((part) => !/^[0-9a-f]{1,4}$/.test(part)) || right.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  const groups = [...left.map((part) => parseInt(part, 16)), ...Array(8 - left.length - right.length).fill(0), ...right.map((part) => parseInt(part, 16))];
  return groups.length === 8 ? groups : null;
}

function isBlockedIPv6(host: string): boolean {
  const groups = parseIPv6(host);
  if (!groups) return true;
  const allZero = groups.every((part) => part === 0);
  const loopback = groups.slice(0, 7).every((part) => part === 0) && groups[7] === 1;
  if (allZero || loopback) return true;

  // IPv4-mapped IPv6 (::ffff:a.b.c.d or ::ffff:hhhh:hhhh) must inherit IPv4 restrictions.
  if (groups.slice(0, 5).every((part) => part === 0) && groups[5] === 0xffff) {
    const ipv4 = [
      groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255,
    ].join(".");
    return isBlockedIPv4(ipv4);
  }

  const first = groups[0];
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00;
}

/** Blocks local/private/special-use IP literals and local-only hostnames. */
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  const version = isIP(h);
  if (version === 4) return isBlockedIPv4(h);
  if (version === 6) return isBlockedIPv6(h);
  return false;
}

export async function callWeb(data: WebInput): Promise<WebResult> {
  const url = new URL(data.url);
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, status: 0, ms: 0, attempts: 0, detail: "Only http/https addresses are allowed." };
  if (isBlockedHost(url.hostname)) return { ok: false, status: 0, ms: 0, attempts: 0, detail: "Private or local addresses can't be called from a flow." };
  const started = Date.now();
  let attempts = 0;
  let last = "";
  while (attempts < 3) {
    attempts++;
    try {
      const hasBody = data.method !== "GET" && data.method !== "DELETE" && data.body;
      const res = await fetch(url, {
        method: data.method,
        headers: hasBody ? { "content-type": "application/json", "user-agent": "Chrishem-AutoStudio/1.0" } : { "user-agent": "Chrishem-AutoStudio/1.0" },
        body: hasBody ? data.body! : null,
        redirect: "manual",
        signal: AbortSignal.timeout(data.timeoutSec * 1000),
      });
      const responseText = (await res.text()).slice(0, 300);
      if (res.status === 429 || res.status >= 500) {
        last = `Got ${res.status} from ${url.hostname}.`;
      } else {
        const ms = Date.now() - started;
        const retried = attempts > 1 ? ` (succeeded on try ${attempts})` : "";
        return res.ok
          ? { ok: true, status: res.status, ms, attempts, detail: `${res.status} from ${url.hostname}${retried}. ${responseText ? `Reply: ${responseText}` : ""}`.trim() }
          : { ok: false, status: res.status, ms, attempts, detail: `${url.hostname} refused the request (${res.status}). Check the address and body. ${responseText}`.trim() };
      }
    } catch (e) {
      last = e instanceof Error && e.name === "TimeoutError" ? `No reply within ${data.timeoutSec}s.` : `Couldn't reach ${url.hostname}.`;
    }
    if (attempts < 3) await new Promise((r) => setTimeout(r, 250 * 2 ** (attempts - 1)));
  }
  return { ok: false, status: 0, ms: Date.now() - started, attempts, detail: `${last} Tried 3 times — try again shortly.` };
}
