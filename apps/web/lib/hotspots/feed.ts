import { lookup } from "node:dns/promises";
import { XMLParser } from "fast-xml-parser";
import {
  HOTSPOT_FETCH_BUDGET_MS,
  HOTSPOT_FETCH_CONCURRENCY,
  HOTSPOT_MAX_REDIRECTS,
  HOTSPOT_SOURCE_MAX_BYTES,
  HOTSPOT_SOURCE_TIMEOUT_MS,
  type HotspotFeedEntry,
  type HotspotSourceFetchOutcome,
  type ResolvedHotspotSource,
} from "@/lib/hotspots/types";
import {
  canonicalHotspotUrl,
  checkHotspotUrl,
  isPrivateNetworkAddress,
  type HotspotUrlPolicy,
} from "@/lib/hotspots/url-policy";
import { clipResearchText } from "@/lib/viral-research/source-policy";

const FEED_ACCEPT_HEADER =
  "application/rss+xml, application/atom+xml, application/feed+json, application/xml;q=0.9, application/json;q=0.9, text/xml;q=0.8, */*;q=0.5";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
});

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** feed 节点可能是字符串、数字，或带属性时被解析成 { "#text": ... }。 */
function textOf(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  const record = asRecord(value);
  if (record) {
    const text = record["#text"];
    if (typeof text === "string") return text.trim() || undefined;
    if (typeof text === "number") return String(text);
  }
  return undefined;
}

function stripMarkup(value: string): string {
  return value
    .replace(/<[^>]*>/gu, " ")
    .replace(/&(?:nbsp|#160);/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/\s+/gu, " ")
    .trim();
}

function summaryOf(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    const raw = textOf(candidate);
    if (!raw) continue;
    const cleaned = stripMarkup(raw);
    if (cleaned) return clipResearchText(cleaned, 400);
  }
  return undefined;
}

function normalizeDate(value: unknown): string | undefined {
  const raw = textOf(value);
  if (!raw) return undefined;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function atomLinkHref(value: unknown): string | undefined {
  const links = toArray(value);
  let fallback: string | undefined;
  for (const link of links) {
    const record = asRecord(link);
    if (!record) {
      const plain = textOf(link);
      if (plain && !fallback) fallback = plain;
      continue;
    }
    const href = textOf(record["@_href"]);
    if (!href) continue;
    const rel = textOf(record["@_rel"]);
    if (!rel || rel === "alternate") return href;
    if (!fallback) fallback = href;
  }
  return fallback;
}

function buildEntry(
  title: string | undefined,
  url: string | undefined,
  publishedAt: string | undefined,
  summary: string | undefined,
): HotspotFeedEntry | undefined {
  const cleanTitle = title ? clipResearchText(stripMarkup(title), 180) : undefined;
  const canonical = url ? canonicalHotspotUrl(url) : undefined;
  if (!cleanTitle || !canonical) return undefined;
  return {
    title: cleanTitle,
    url: canonical,
    ...(publishedAt ? { publishedAt } : {}),
    ...(summary ? { summary } : {}),
  };
}

function parseRssEntries(channel: Record<string, unknown>): HotspotFeedEntry[] {
  return toArray(channel.item).flatMap((raw) => {
    const item = asRecord(raw);
    if (!item) return [];
    const entry = buildEntry(
      textOf(item.title),
      textOf(item.link) ?? textOf(item.guid),
      normalizeDate(item.pubDate) ?? normalizeDate(item["dc:date"]),
      summaryOf(item.description, item["content:encoded"]),
    );
    return entry ? [entry] : [];
  });
}

function parseAtomEntries(feed: Record<string, unknown>): HotspotFeedEntry[] {
  return toArray(feed.entry).flatMap((raw) => {
    const item = asRecord(raw);
    if (!item) return [];
    const entry = buildEntry(
      textOf(item.title),
      atomLinkHref(item.link) ?? textOf(item.id),
      normalizeDate(item.published) ?? normalizeDate(item.updated),
      summaryOf(item.summary, item.content),
    );
    return entry ? [entry] : [];
  });
}

function parseJsonFeedEntries(payload: string): HotspotFeedEntry[] {
  const root = asRecord(JSON.parse(payload) as unknown);
  if (!root) throw new Error("JSON Feed 结构无法识别");
  const items = Array.isArray(root.items) ? root.items : undefined;
  if (!items) throw new Error("JSON Feed 缺少 items");
  return items.flatMap((raw) => {
    const item = asRecord(raw);
    if (!item) return [];
    const entry = buildEntry(
      textOf(item.title),
      textOf(item.url) ?? textOf(item.external_url) ?? textOf(item.id),
      normalizeDate(item.date_published) ?? normalizeDate(item.date_modified),
      summaryOf(item.summary, item.content_text, item.content_html),
    );
    return entry ? [entry] : [];
  });
}

/** 按内容自动判别 RSS 2.0 / Atom / JSON Feed，不依赖源声明的 kind。 */
export function parseHotspotFeed(payload: string): HotspotFeedEntry[] {
  const trimmed = payload.trim();
  if (!trimmed) throw new Error("响应为空");
  if (trimmed.startsWith("{")) return parseJsonFeedEntries(trimmed);

  const parsed = asRecord(xmlParser.parse(trimmed) as unknown);
  if (!parsed) throw new Error("XML 结构无法识别");
  const rss = asRecord(parsed.rss);
  const channel = asRecord(rss?.channel) ?? asRecord(parsed.channel);
  if (channel) return parseRssEntries(channel);
  const feed = asRecord(parsed.feed);
  if (feed) return parseAtomEntries(feed);
  throw new Error("既不是 RSS 也不是 Atom");
}

export function sortAndClipEntries(
  entries: readonly HotspotFeedEntry[],
  maxItems: number,
): HotspotFeedEntry[] {
  const withOrder = entries.map((entry, index) => ({ entry, index }));
  withOrder.sort((left, right) => {
    const leftTime = left.entry.publishedAt
      ? Date.parse(left.entry.publishedAt)
      : Number.NaN;
    const rightTime = right.entry.publishedAt
      ? Date.parse(right.entry.publishedAt)
      : Number.NaN;
    const leftValid = Number.isFinite(leftTime);
    const rightValid = Number.isFinite(rightTime);
    if (leftValid && rightValid && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    if (leftValid !== rightValid) return leftValid ? -1 : 1;
    return left.index - right.index;
  });
  return withOrder.slice(0, Math.max(0, maxItems)).map((item) => item.entry);
}

/** 边读边计数，避免把超大响应整个读进内存后才判超限。 */
async function readCappedText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error("响应超过 2MB 上限");
  }
  const body = response.body;
  if (!body) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw new Error("响应超过 2MB 上限");
    }
    return text;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new Error("响应超过 2MB 上限");
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return text + decoder.decode();
}

export interface HotspotFetchOptions {
  policy?: HotspotUrlPolicy;
  fetchImpl?: typeof fetch;
  maxItemsPerSource: number;
  timeoutMs?: number;
  maxBytes?: number;
  concurrency?: number;
  budgetMs?: number;
  now?: () => Date;
  /** 测试可注入；生产默认使用系统 DNS，并在每次重定向前重新校验。 */
  resolveHostname?: (hostname: string) => Promise<string[]>;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return "抓取超时";
    }
    return clipResearchText(error.message, 160) ?? "抓取失败";
  }
  return "抓取失败";
}

async function fetchOneSource(
  source: ResolvedHotspotSource,
  requestUrl: string,
  options: Required<
    Pick<HotspotFetchOptions, "maxItemsPerSource" | "timeoutMs" | "maxBytes">
  > & {
    policy: HotspotUrlPolicy;
    fetchImpl: typeof fetch;
    remainingMs: number;
    resolveHostname?: (hostname: string) => Promise<string[]>;
  },
): Promise<HotspotFeedEntry[]> {
  const timeoutMs = Math.max(
    1,
    Math.min(options.timeoutMs, options.remainingMs),
  );
  const signal = AbortSignal.timeout(timeoutMs);
  let currentUrl = requestUrl;
  let response: Response | undefined;

  for (let redirectCount = 0; ; redirectCount += 1) {
    const check = checkHotspotUrl(currentUrl, options.policy);
    if (!check.ok) {
      throw new Error(
        redirectCount > 0
          ? `重定向目标不被允许：${check.reason}`
          : check.reason,
      );
    }
    const checkedUrl = new URL(check.url);
    const explicitlyAllowedRsshub =
      options.policy.rsshubOrigin === checkedUrl.origin;
    if (options.resolveHostname && !explicitlyAllowedRsshub) {
      const addresses = await options.resolveHostname(checkedUrl.hostname);
      if (!addresses.length) throw new Error("域名未解析到可用地址");
      if (addresses.some(isPrivateNetworkAddress)) {
        throw new Error("域名解析到内网或本机地址，已拒绝抓取");
      }
    }
    response = await options.fetchImpl(check.url, {
      method: "GET",
      headers: { Accept: FEED_ACCEPT_HEADER },
      redirect: "manual",
      signal,
    });
    if (response.url) {
      const responseCheck = checkHotspotUrl(response.url, options.policy);
      if (!responseCheck.ok) {
        throw new Error(`响应地址不被允许：${responseCheck.reason}`);
      }
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    if (redirectCount >= HOTSPOT_MAX_REDIRECTS) {
      throw new Error(`重定向超过 ${HOTSPOT_MAX_REDIRECTS} 次上限`);
    }
    const location = response.headers.get("location");
    if (!location) throw new Error("重定向响应缺少 Location");
    response.body?.cancel().catch(() => {});
    try {
      currentUrl = new URL(location, check.url).toString();
    } catch {
      throw new Error("重定向目标无法解析");
    }
  }
  if (!response) throw new Error("抓取未返回响应");
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = await readCappedText(response, options.maxBytes);
  return sortAndClipEntries(
    parseHotspotFeed(payload),
    options.maxItemsPerSource,
  );
}

/** 并发抓取；单源失败只写进 sourceReports，永不抛出。 */
export async function fetchHotspotSources(
  sources: readonly ResolvedHotspotSource[],
  options: HotspotFetchOptions,
): Promise<HotspotSourceFetchOutcome[]> {
  const policy = options.policy ?? {};
  const fetchImpl = options.fetchImpl ?? fetch;
  const resolveHostname =
    options.resolveHostname ??
    (options.fetchImpl
      ? undefined
      : async (hostname: string) =>
          (await lookup(hostname, { all: true, verbatim: true })).map(
            (record) => record.address,
          ));
  const timeoutMs = options.timeoutMs ?? HOTSPOT_SOURCE_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? HOTSPOT_SOURCE_MAX_BYTES;
  const concurrency = Math.max(1, options.concurrency ?? HOTSPOT_FETCH_CONCURRENCY);
  const now = options.now ?? (() => new Date());
  const deadline = now().getTime() + (options.budgetMs ?? HOTSPOT_FETCH_BUDGET_MS);

  const outcomes: HotspotSourceFetchOutcome[] = sources.map((source) => ({
    report: {
      sourceId: source.config.id,
      sourceName: source.config.name,
      status: "skipped",
      itemCount: 0,
      ...(source.skipReason ? { message: source.skipReason } : {}),
    },
    entries: [],
  }));

  const pending = sources
    .map((source, index) => ({ source, index }))
    .filter((task) => Boolean(task.source.requestUrl));

  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const taskIndex = cursor;
      cursor += 1;
      const task = pending[taskIndex];
      if (!task) return;
      const outcome = outcomes[task.index];
      if (!outcome) continue;
      const remainingMs = deadline - now().getTime();
      if (remainingMs <= 0) {
        outcome.report = {
          ...outcome.report,
          status: "failed",
          itemCount: 0,
          message: "整体抓取预算已用完",
        };
        continue;
      }
      try {
        const entries = await fetchOneSource(
          task.source,
          task.source.requestUrl ?? "",
          {
            policy,
            fetchImpl,
            maxItemsPerSource: options.maxItemsPerSource,
            timeoutMs,
            maxBytes,
            remainingMs,
            resolveHostname,
          },
        );
        outcome.entries = entries;
        outcome.report = {
          ...outcome.report,
          status: "ok",
          itemCount: entries.length,
        };
        delete outcome.report.message;
      } catch (error) {
        outcome.report = {
          ...outcome.report,
          status: "failed",
          itemCount: 0,
          message: errorMessage(error),
        };
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, pending.length) }, worker),
  );
  return outcomes;
}
