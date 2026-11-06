import type { HotspotSourceConfig } from "@video-diagnosis/shared-types";

/** 平台接口使用各自的响应结构；URL 同时是适配器的白名单。 */
export const PLATFORM_HOTSPOT_SOURCES = [
  { id: "weibo", name: "微博热搜", url: "https://weibo.com/ajax/side/hotSearch" },
  { id: "baidu", name: "百度热搜", url: "https://top.baidu.com/board?tab=realtime" },
  { id: "douyin", name: "抖音热榜", url: "https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/" },
  { id: "toutiao", name: "今日头条", url: "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc" },
  { id: "36kr", name: "36氪热榜", url: "https://gateway.36kr.com/api/mis/nav/home/nav/rank/hot" },
  { id: "bilibili", name: "B站排行", url: "https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all" },
].map((source) => ({ ...source, kind: "platform" as const, enabled: true })) satisfies HotspotSourceConfig[];

export function platformSourceForUrl(url: string): HotspotSourceConfig | undefined {
  return PLATFORM_HOTSPOT_SOURCES.find((source) => source.url === url.trim());
}
