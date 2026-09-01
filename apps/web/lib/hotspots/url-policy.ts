import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { sanitizeResearchUrl } from "@/lib/viral-research/source-policy";

/** sanitizeResearchUrl 已处理 utm_/spm 等，这里补齐资讯站常见的会话与推荐参数。 */
const EXTRA_TRACKING_PARAMETERS = new Set([
  "hmci",
  "hmcu",
  "hmkw",
  "hmpl",
  "hmsr",
  "ref",
  "ref_src",
  "referer",
  "referrer",
  "share_from",
  "share_medium",
  "share_source",
  "tt_from",
]);

const IPV4_LITERAL = /^\d{1,3}(?:\.\d{1,3}){3}$/u;
/** 内网/本机专用域名后缀；WHATWG URL 已把十进制、八进制 IP 归一成点分形式。 */
const PRIVATE_HOST_SUFFIX =
  /(?:^|\.)(?:localhost|local|internal|intranet|lan|home\.arpa)$/iu;

export interface HotspotUrlPolicy {
  /** 显式配置的 RSSHub origin：唯一允许 http、内网地址与非默认端口的目标。 */
  rsshubOrigin?: string;
}

function privateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some(
      (part) => !Number.isInteger(part) || part < 0 || part > 255,
    )
  ) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

/** DNS 解析后再检查地址，阻止公网域名解析到本机、内网或链路本地地址。 */
export function isPrivateNetworkAddress(rawAddress: string): boolean {
  const address = rawAddress.trim().toLowerCase().replace(/^\[|\]$/gu, "");
  const family = isIP(address);
  if (family === 4) return privateIpv4(address);
  if (family !== 6) return true;
  const mapped = address.match(/^(?:::ffff:)(\d{1,3}(?:\.\d{1,3}){3})$/u)?.[1];
  if (mapped) return privateIpv4(mapped);
  return (
    address === "::" ||
    address === "::1" ||
    address.startsWith("fc") ||
    address.startsWith("fd") ||
    /^fe[89ab]/u.test(address)
  );
}

export function createHotspotUrlPolicy(
  rsshubBaseUrl?: string,
): HotspotUrlPolicy {
  const raw = rsshubBaseUrl?.trim();
  if (!raw) return {};
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return {};
    return { rsshubOrigin: url.origin };
  } catch {
    return {};
  }
}

export type HotspotUrlCheck =
  | { ok: true; url: string }
  | { ok: false; reason: string };

/**
 * 抓取目标的 SSRF 白名单。默认只允许 https + 公网域名 + 默认端口；
 * 只有用户在设置中显式填写的 RSSHub 实例可以走 http、内网地址与自定义端口，
 * 因为那是用户自建服务，地址由用户自己负责。
 */
export function checkHotspotUrl(
  raw: string,
  policy: HotspotUrlPolicy = {},
): HotspotUrlCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "地址无法解析" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "只允许 http(s) 协议" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "地址不允许携带账号密码" };
  }
  if (policy.rsshubOrigin && url.origin === policy.rsshubOrigin) {
    return { ok: true, url: url.toString() };
  }
  if (url.protocol !== "https:") {
    return { ok: false, reason: "非 RSSHub 源必须使用 https" };
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname.startsWith("[") || IPV4_LITERAL.test(hostname)) {
    return { ok: false, reason: "不允许直接使用 IP 地址" };
  }
  if (PRIVATE_HOST_SUFFIX.test(hostname)) {
    return { ok: false, reason: "不允许访问内网或本机地址" };
  }
  if (!hostname.includes(".")) {
    return { ok: false, reason: "域名不合法" };
  }
  if (url.port && url.port !== "443") {
    return { ok: false, reason: "只允许 https 默认端口" };
  }
  return { ok: true, url: url.toString() };
}

/** 去锚点、去追踪参数、排序 query、去尾斜杠，得到跨源可比的唯一地址。 */
export function canonicalHotspotUrl(value: unknown): string | undefined {
  const sanitized = sanitizeResearchUrl(value);
  if (!sanitized) return undefined;
  try {
    const url = new URL(sanitized);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (EXTRA_TRACKING_PARAMETERS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/u, "");
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

export function hotspotItemId(canonicalUrl: string): string {
  return createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 24);
}
