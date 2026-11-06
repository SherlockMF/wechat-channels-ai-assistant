import { describe, expect, it, vi } from "vitest";
import type { HotspotSourceConfig } from "@video-diagnosis/shared-types";
import { fetchHotspotSources } from "@/lib/hotspots/feed";
import { resolveHotspotRuntimeConfig, resolveHotspotSources } from "@/lib/hotspots/sources";

const platforms = [
  { id: "weibo", url: "https://weibo.com/ajax/side/hotSearch", body: { data: { realtime: [{ word: "智能家居", num: 800 }] } }, title: "智能家居" },
  { id: "baidu", url: "https://top.baidu.com/board?tab=realtime", body: '<html><!--s-data:{"data":{"cards":[{"content":[{"query":"净水新技术","rawUrl":"https://example.com/news","desc":"真实的榜单摘要"}]}]}}--></html>', title: "净水新技术" },
  { id: "douyin", url: "https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/", body: { word_list: [{ word: "家电安装" }] }, title: "家电安装" },
  { id: "toutiao", url: "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc", body: { data: [{ Title: "装修日记", Url: "https://www.toutiao.com/article/123" }] }, title: "装修日记" },
  { id: "36kr", url: "https://gateway.36kr.com/api/mis/nav/home/nav/rank/hot", body: { data: { hotRankList: [{ itemId: "123", templateMaterial: { widgetTitle: "科技新品" } }] } }, title: "科技新品" },
  { id: "bilibili", url: "https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all", body: { code: 0, data: { list: [{ bvid: "BVtest", title: "安装教程" }] } }, title: "安装教程" },
];

function source(p: typeof platforms[number]): HotspotSourceConfig {
  return { id: p.id, name: p.id, url: p.url, kind: "platform" as HotspotSourceConfig["kind"], enabled: true };
}

describe("平台热榜直连", () => {
  it.each(platforms)("解析 $id 平台结构而不是将它误当 JSON Feed", async (p) => {
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) => new Response(typeof p.body === "string" ? p.body : JSON.stringify(p.body)));
    const [result] = await fetchHotspotSources([{ config: source(p), requestUrl: p.url }], { fetchImpl, maxItemsPerSource: 20 });
    expect(result?.report).toMatchObject({ status: "ok", itemCount: 1 });
    expect(result?.entries[0]?.title).toBe(p.title);
    expect(result?.entries[0]?.url).toMatch(/^https:\/\//);
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ headers: expect.objectContaining({ "User-Agent": expect.stringContaining("Mozilla") }) });
  });

  it("36氪使用固定 POST 参数，微博请求包含 Referer", async () => {
    const fetchImpl = vi.fn(async (url: URL | RequestInfo, _init?: RequestInit) => new Response(JSON.stringify(String(url).includes("36kr") ? platforms[4]!.body : platforms[0]!.body)));
    const sources = [platforms[4]!, platforms[0]!].map((p) => ({ config: source(p), requestUrl: p.url }));
    await fetchHotspotSources(sources, { fetchImpl, maxItemsPerSource: 20 });
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: expect.stringContaining('"partner_id":"wap"') });
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({ headers: expect.objectContaining({ Referer: "https://weibo.com/" }) });
  });

  it("空榜或业务错误报告失败，不把空数组当成功", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code: -412, data: { list: [] } })));
    const p = platforms[5]!;
    const [result] = await fetchHotspotSources([{ config: source(p), requestUrl: p.url }], { fetchImpl, maxItemsPerSource: 20 });
    expect(result?.report.status).toBe("failed");
    expect(result?.report.message).toContain("-412");
  });

  it("未知平台地址不会发送请求，单源失败不影响其它源", async () => {
    const p = platforms[0]!;
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(p.body)));
    const bad = { ...source(p), id: "custom", url: "https://example.com/custom" };
    const results = await fetchHotspotSources([{ config: bad, requestUrl: bad.url }, { config: source(p), requestUrl: p.url }], { fetchImpl, maxItemsPerSource: 20 });
    expect(results.map((r) => r.report.status)).toEqual(["failed", "ok"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("平台直连继续拒绝解析到内网的域名", async () => {
    const p = platforms[0]!;
    const fetchImpl = vi.fn();
    const [result] = await fetchHotspotSources([{ config: source(p), requestUrl: p.url }], { fetchImpl, maxItemsPerSource: 20, resolveHostname: async () => ["127.0.0.1"] });
    expect(result?.report.status).toBe("failed");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("网络报错给出底层原因但不输出带凭证的错误文本", async () => {
    const p = platforms[0]!;
    const cause = Object.assign(new Error("sensitive connection details"), { code: "ECONNREFUSED" });
    const fetchImpl = vi.fn(async () => { throw new TypeError("fetch failed", { cause }); });
    const [result] = await fetchHotspotSources([{ config: source(p), requestUrl: p.url }], { fetchImpl, maxItemsPerSource: 20 });
    expect(result?.report.message).toContain("ECONNREFUSED");
    expect(result?.report.message).not.toContain("sensitive");
  });
});

describe("默认源升级", () => {
  it("默认九源包含六个平台与三个直接RSS，无需RSSHub", () => {
    const config = resolveHotspotRuntimeConfig();
    expect(config.sources).toHaveLength(9);
    expect(config.sources.filter((s) => s.kind === "platform")).toHaveLength(6);
    expect(config.sources.filter((s) => s.kind === "rss")).toHaveLength(3);
    expect(resolveHotspotSources(config).every((s) => s.requestUrl?.startsWith("https://"))).toBe(true);
  });

  it("旧内置源迁移到直连、保留停用状态和自定义源", () => {
    const custom: HotspotSourceConfig = { id: "custom", name: "自定义服务", kind: "rsshub", url: "/custom/feed", enabled: true };
    const config = resolveHotspotRuntimeConfig({ sources: [
      { id: "rsshub-weibo-hot", name: "微博热搜（TopHub）", url: "/tophub/WnBe01o371", kind: "rsshub", enabled: false },
      { id: "rsshub-douyin-hot", name: "抖音总榜（TopHub）", url: "/tophub/Y2KeDGQdNP", kind: "rsshub", enabled: true },
      { id: "rsshub-zhihu-hot", name: "知乎热榜（RSSHub）", url: "/zhihu/hot", kind: "rsshub", enabled: true },
      custom,
    ], rsshubBaseUrl: "http://127.0.0.1:1200" });
    expect(config.sources.find((s) => s.id === "weibo")).toMatchObject({ kind: "platform", enabled: false });
    expect(config.sources.find((s) => s.id === "douyin")).toMatchObject({ kind: "platform", enabled: true });
    expect(config.sources.find((s) => s.id === "rsshub-zhihu-hot")?.enabled).toBe(false);
    expect(config.sources.find((s) => s.id === "custom")).toEqual(custom);
  });

  it("保留用户修改的来源名称，不把同id自定义路由误迁移", () => {
    const sources: HotspotSourceConfig[] = [
      { id: "rsshub-weibo-hot", name: "我的社会热点", url: "/tophub/WnBe01o371", kind: "rsshub", enabled: true },
      { id: "36kr", name: "我的科技源", url: "/custom/36kr", kind: "rsshub", enabled: true },
    ];
    const config = resolveHotspotRuntimeConfig({ sources });
    expect(config.sources[0]).toMatchObject({ id: "weibo", name: "我的社会热点", kind: "platform" });
    expect(config.sources[1]).toEqual(sources[1]);
  });
});
