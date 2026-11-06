import { platformSourceForUrl } from "@/lib/hotspots/platform-catalog";
import type { HotspotFeedEntry } from "@/lib/hotspots/types";
import { canonicalHotspotUrl } from "@/lib/hotspots/url-policy";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value).replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim() : "";
const list = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(record) : [];

export function platformRequest(url: string): { id: string; method: string; headers: Record<string, string>; body?: string } {
  const source = platformSourceForUrl(url);
  if (!source) throw new Error("不支持的平台接口地址，请恢复默认源或改用 RSS/JSON Feed 类型");
  const headers: Record<string, string> = { "User-Agent": USER_AGENT, "Accept-Language": "zh-CN,zh;q=0.9" };
  if (source.id === "weibo") headers.Referer = "https://weibo.com/";
  if (source.id === "bilibili") headers.Referer = "https://www.bilibili.com/";
  if (source.id === "36kr") {
    headers["Content-Type"] = "application/json";
    return { id: source.id, method: "POST", headers, body: JSON.stringify({ partner_id: "wap", param: { siteId: 1, platformId: 2 }, timestamp: 0 }) };
  }
  return { id: source.id, method: "GET", headers };
}

function entry(titleValue: unknown, urlValue: unknown, summaryValue?: unknown): HotspotFeedEntry[] {
  const title = text(titleValue).slice(0, 180);
  const url = canonicalHotspotUrl(text(urlValue));
  if (!title || !url) return [];
  const summary = text(summaryValue).slice(0, 400);
  return [{ title, url, ...(summary ? { summary } : {}) }];
}

export function parsePlatformBoard(id: string, payload: string): HotspotFeedEntry[] {
  let data: Record<string, unknown>;
  if (id === "baidu") {
    const embedded = /<!--s-data:([\s\S]*?)-->/u.exec(payload)?.[1];
    if (!embedded) throw new Error("百度热榜页面未包含榜单数据块");
    data = record(JSON.parse(embedded));
  } else {
    data = record(JSON.parse(payload));
  }
  const inner = record(data.data);
  let entries: HotspotFeedEntry[];
  switch (id) {
    case "weibo":
      entries = list(inner.realtime).flatMap((item) => {
        const word = text(item.word || item.note);
        return entry(word, `https://s.weibo.com/weibo?q=${encodeURIComponent(`#${word}#`)}`);
      });
      break;
    case "baidu":
      entries = list(list(inner.cards)[0]?.content).flatMap((item) => entry(item.query || item.word, item.rawUrl || item.appUrl, item.desc));
      break;
    case "douyin":
      entries = list(data.word_list).flatMap((item) => entry(item.word, `https://www.douyin.com/search/${encodeURIComponent(text(item.word))}`));
      break;
    case "toutiao":
      entries = list(data.data).flatMap((item) => entry(item.Title, item.Url));
      break;
    case "36kr":
      entries = list(inner.hotRankList).flatMap((item) => text(item.itemId)
        ? entry(record(item.templateMaterial).widgetTitle, `https://36kr.com/p/${encodeURIComponent(text(item.itemId))}`)
        : []);
      break;
    case "bilibili":
      if (data.code !== 0) throw new Error(`B站接口返回 code ${text(data.code) || "未知"}，可能被限流`);
      entries = list(inner.list).flatMap((item) => text(item.bvid)
        ? entry(item.title, `https://www.bilibili.com/video/${encodeURIComponent(text(item.bvid))}`)
        : []);
      break;
    default:
      throw new Error("没有对应的平台解析器");
  }
  if (!entries.length) throw new Error("榜单返回为空，平台接口可能已变化");
  return entries;
}
