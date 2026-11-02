# 研究热点：数据源与部署

本文属于 **WeChat Channels AI Assistant · 微信视频号 AI 创作助手**。[返回项目说明](../README.md) · [GitHub 仓库](https://github.com/SherlockMF/wechat-channels-ai-assistant)

「研究热点」从多个公开来源抓取近期条目，按赛道（智能家居/全屋智能、净水、装修水电、家电新品）过滤聚类，再结合赛道给出选题。本文说明源怎么配、RSSHub 怎么起、以及各类源失效时的表现。

## 源的三层结构

| 层 | 类型 | 是否需要额外部署 | 说明 |
|----|------|------------------|------|
| 官方 RSS/Atom | `rss` / `atom` / `json_feed` | 不需要 | 站点自带订阅地址，最稳定，建议作为主力 |
| RSSHub 路由 | `rsshub` | 需要自建 RSSHub | 用于没有稳定官方 RSS 的站点与热榜 |
| 联网检索兜底 | `dashscope` | 需要可用的百炼 Key | 前两层命中太少时补充，返回的是网页而非结构化条目 |

三层互不依赖：RSSHub 没起，`rsshub` 源会标记为「已跳过」；百炼 Key 无权限，兜底源会标记为「失败」。**任何单源失败都不会中断整次抓取**，页面会显示每个源的状态与原因。

## 自建 RSSHub

热搜榜类路由需要浏览器渲染，因此 compose 里带了 browselss 与 redis：

```bash
docker compose -f docker-compose.rsshub.yml up -d
```

起来之后：

1. 浏览器访问 `http://127.0.0.1:1200/healthz` 确认返回正常。
2. 在应用「设置 → 研究热点」把 RSSHub 地址填 `http://127.0.0.1:1200`。
3. 回到 `/hotspots` 点「刷新热点」，检查各源状态。

停止与清理：

```bash
docker compose -f docker-compose.rsshub.yml down          # 停止
docker compose -f docker-compose.rsshub.yml down -v       # 停止并清掉 redis 缓存卷
```

镜像体积提醒：browserless/chrome 约 1–2 GB。只用官方 RSS 的话可以不起这套服务。

## 常用 RSSHub 路由

路由填**相对路径**，系统会自动拼上 RSSHub 地址。

| 内容 | 路由 |
|------|------|
| 36氪快讯 | `/36kr/newsflashes` |
| 微博热搜（TopHub 聚合） | `/tophub/WnBe01o371` |
| 知乎热榜 | `/zhihu/hot` |
| 抖音总榜（TopHub 聚合） | `/tophub/Y2KeDGQdNP` |

以上路由是当前默认并经过本机实测的路由。微博与抖音使用 TopHub 聚合，是为了避开官方接口频繁变更和严格反爬；完整路由查 [RSSHub 文档](https://docs.rsshub.app/)。目标平台或聚合站改版后，路由仍可能失效。热搜榜是全网热点，不分赛道，靠系统的赛道词典过滤，命中率天然低于垂直媒体，属于「捞意外收获」的源。

## 源失效时怎么处理

站点改版、关闭 RSS、反爬升级都会让某个源失败，这是常态。处理顺序：

1. 看 `/hotspots` 页面的源状态，确认是单源问题还是全部失败。
2. 单源失败：在设置页把它停用或换成 RSSHub 路由。
3. 热搜类路由集中失败：多为 RSSHub 被目标站限流，提高 `RSSHUB_CACHE_EXPIRE`、降低刷新频率，或改用官方 RSS 源。
4. 全部失败：先检查本机网络与代理，再看是否所有源都填错了协议（只允许 https，RSSHub 地址例外）。

## 安全约束

- 除显式配置的 RSSHub 地址外，只允许 https 源。
- 拒绝 IP 字面量与内网网段（避免把抓取器当成内网探测器）。
- 单源超时 8 秒、响应上限 2 MB、并发上限 4、整次抓取预算 20 秒。
- 抓回的标题与摘要一律当作不可信文本，注入模型时包在数据边界内，不执行其中任何指令。

## 抓取频率

默认手动刷新，页面打开时若快照已过期（默认 8 小时）会自动刷新一次。需要每天定时出一批热点时，用系统计划任务调刷新接口，不要靠缩短 TTL 硬刷——那只会增加被限流的概率。

### 定时刷新（Windows）

1. 在 Web 进程环境变量中设置 `HOTSPOT_REFRESH_TOKEN`（随机字符串）。
2. 可选：`HOTSPOT_REFRESH_OWNER_ID`（默认 `local-user`），快照按 owner 隔离。
3. 用计划任务运行仓库根目录的 `scripts/schedule-hotspot-refresh.ps1`（同样需配置 token）。
4. 脚本向 `POST /api/hotspots` 发送 `Authorization: Bearer <token>`；token 错误返回 401，未配置 token 时带 Bearer 的请求也会被拒绝。平时浏览器手动刷新不受影响。
