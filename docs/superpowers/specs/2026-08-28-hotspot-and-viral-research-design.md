# 热点研究与爆款研究改造

## 目标

1. 把现有「联网爆款研究」从"检索爆款互动指标"改为"检索可追溯的主题证据"，让每次研究都有可用产出；之后再补人工录入的爆款样本库，作为真实指标的唯一来源。
2. 新增「研究热点」：从多个新闻源与热榜抓取近期条目，按赛道过滤与聚类，结合赛道与账号历史产出针对性选题卡，并可一键带入脚本工作台。

赛道范围：智能家居/全屋智能、净水/软水/饮水、装修水电/施工验收、家电新品/家庭影院。

## 现状诊断（改造依据）

| 问题 | 位置 | 事实 |
|------|------|------|
| 指标字段永远为空 | `apps/web/lib/viral-research/dashscope.ts` `visibleMetrics()` | 百炼原生 `output.search_info.search_results` 每条只有 `index/title/url`，无摘要、无站点、无互动指标 |
| 所有选题卡被降级 | `apps/web/lib/viral-research/service.ts` `completeTopicCards()` | 要求 3 条来源均为 `verified_metric`，实际恒为 0，全部改名「资料候选｜」并叠加免责声明 |
| 相关性过滤裸奔 | `apps/web/lib/viral-research/source-policy.ts` `isResearchItemRelevant()` | 匹配依赖 `title + snippet + site`，后两者恒为空，误杀大量相关结果 |
| 三重「至少 3 条」门槛 | `service.ts` 多处 | 任一不过即输出「未生成选题卡」 |
| 多模态分支参数互斥 | `dashscope.ts` `searchDashScopeMultimodal()` | 官方规定 `search_strategy:"agent"` 下仅 `enable_source` 生效，`forced_search`/`freshness`/`prepend_search_result` 无效；agent 额外计费、必须流式，推理期会检索大量无关网页 |
| 体验噪声 | `script-research-panel.tsx` | 打开面板即自动发起 45–90s 检索；失败提示是技术术语；`limitations` 一次可堆 8 条 |

结论：视频号无公开可索引页面，抖音/小红书视频页极少进通用索引且从不带指标，"用通用搜索索引研究爆款指标"不可达，必须改变能力边界。

## 已确认决策

| 决策 | 选择 |
|------|------|
| 爆款研究方向 | 先改为主题证据检索（不承诺互动指标），后续补人工/半自动爆款样本库 |
| 热点数据源 | 官方 RSS + 自建 RSSHub + 百炼联网检索兜底，三层全上 |
| 抓取触发 | 手动刷新 + 打开页面时快照过期自动刷新；定时调度留作后续可选 |
| 赛道 | 智能家居/全屋智能、净水、装修水电、家电新品/家庭影院 |
| 部署边界 | LOCAL/REAL 全功能；Sites/D1 沿用 501 未支持约定 |

## 第一部分：爆款研究改造

### 证据分级替代指标分级

`viralResearchEvidenceLevelSchema` 扩展（旧值保留以兼容历史快照）：

| 值 | 含义 | 判定方式 |
|----|------|----------|
| `platform_page` | 短视频/笔记页面 | URL 命中抖音/小红书/B站/快手/视频号域名 |
| `media_article` | 行业媒体文章 | URL 命中行业媒体域名清单 |
| `public_source` | 其他公开网页（兼容旧数据） | 兜底 |
| `verified_metric` | 带真实互动指标 | **仅**人工录入的爆款样本 |
| `account_history` | 本账号历史 | 现状不变 |

前端三组改为「平台内容 / 行业资料 / 本账号历史」，空组不渲染，删除永远为空的「带公开指标」分组。

### 相关性判定合并进同一次模型调用

不新增请求。扩展 `analysisSchema`，让模型在返回分析的同时对每条搜索来源打标：

```ts
sourceJudgements: Array<{
  index: number;
  relevant: boolean;
  kind: "platform_page" | "media_article" | "generic_page";
  reason: string;      // 一句话，写入 relevanceReasons
}>
```

服务端保留 `relevant === true` 的条目；模型未覆盖的 index 退回赛道词典匹配（宽松规则，不再要求摘要）。删除依赖空摘要的 bigram 判定。

### 门槛与文案

- 选题卡：来源 ≥1 条即可生成，最多 3 张；卡上带证据强度标签（平台内容 / 行业资料）。
- 取消「资料候选｜」前缀重写，改为结构化字段 `evidenceStrength`，由 UI 渲染徽章。
- `limitations` 最多 2 条，用人话；技术细节只进 `degradedReason`。

### 请求参数与超时

- 主路径：文本模型 + `search_options: { forced_search: true, search_strategy: "max", enable_source: true, freshness }`，超时 30s。
- 多模态路径（仅当用户显式配置 qwen3.5+/VL/Omni）：`search_options` **只保留** `search_strategy: "agent"` 与 `enable_source: true`，流式，超时 60s。
- query 侧用赛道词典扩展检索词（下移到共享词典，见下）。

### 共享赛道词典

新增 `apps/web/lib/tracks/dictionary.ts`：赛道 id、展示名、关键词扩展、所需证据模板。`viral-research/source-policy.ts` 的 `DOMAIN_TERM_EXPANSIONS`、`service.ts` 的 `evidenceRequirements()` 与热点模块共用同一份，避免两处维护。

### 缓存与触发

- 缓存 key 加入 `model`（同主题换模型不再复用旧结果），TTL `24h → 72h`。
- 过期时先返回旧快照并标记 `stale: true`，前端展示后台刷新。
- 面板改为手动触发（按钮「开始研究」），移除 `useEffect` 自动发起；进度分「检索公开来源 → 整理选题角度」两步提示。

### 爆款样本库（阶段 4 轮廓）

- 手动录入：URL + 标题 + 平台 + 可选真实指标 + 备注 → `evidenceLevel: "verified_metric"`，并记录 `metricsSource: "manual"`。
- 可选把样本视频投入现有审片/分镜管线，产出结构拆解（钩子、节奏、证据点、转化话术），归纳为可复用结构。
- 存储：新增 AppState 集合 `viralSamples`；先落 LOCAL，REAL/Sites 明确标注未支持，避免静默降级。
- 系统只做结构化拆解，不生成任何数字。

## 第二部分：研究热点

### 数据模型（`packages/shared-types/src/index.ts`）

```ts
hotspotSourceKind = "rss" | "atom" | "json_feed" | "rsshub" | "dashscope";

HotspotSourceConfig {
  id: string;            // 稳定 id，用于 item 归属
  name: string;
  url: string;           // rsshub 类型存路由，运行时拼 rsshubBaseUrl
  kind: HotspotSourceKind;
  enabled: boolean;
}

HotspotItem {
  id: string;            // sha256(canonicalUrl) 前 24 位
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  publishedAt?: string;
  summary?: string;      // RSS 有 description 时才有
  trackIds: string[];    // 命中赛道
  matchedTerms: string[];
}

HotspotCluster {
  id: string;
  headline: string;      // 取命中源最多/最早的标题
  itemIds: string[];
  sourceCount: number;   // 独立源数量
  firstSeenAt: string;
  latestAt: string;
  heat: number;
  trackIds: string[];
}

HotspotTopicCard {
  id: string;
  clusterId: string;
  title: string;
  hook: string;          // 前 3 秒开场
  whyNow: string;
  targetAudience: string;
  trackIds: string[];
  shootability: "low" | "medium" | "high";
  requiredEvidence: string[];
  timeWindowDays: number; // 时效窗口
  risks: string[];
  sourceIds: string[];    // 引用 HotspotItem.id，至少 1 条
}

HotspotSnapshot {
  id: string;             // hs-{configHash16}-{suffix24}
  ownerId: string;
  fetchedAt: string;
  expiresAt: string;
  sourceReports: Array<{ sourceId: string; status: "ok" | "failed" | "skipped"; itemCount: number; message?: string }>;
  items: HotspotItem[];          // 最多 120
  clusters: HotspotCluster[];    // 最多 20
  topicCards: HotspotTopicCard[];// 最多 12
  limitations: string[];         // 最多 2
  degradedReason?: string | null;
}
```

### 热度公式（可解释，不用黑盒）

```
heat = sourceCount * 3 + itemCount + recencyBonus
recencyBonus = 最新条目在 24h 内 +4；24–72h 内 +2；超过 72h +0
```

聚类：标题归一化后 bigram 相似度 ≥0.45 且 `publishedAt` 相差 ≤72h 视为同一事件；无 `publishedAt` 时按抓取时间处理。

### 模块结构（`apps/web/lib/hotspots/`）

| 文件 | 职责 |
|------|------|
| `types.ts` | Zod schema、配置类型、常量（TTL 8h、并发 4、单源超时 8s、单源响应上限 2MB） |
| `sources.ts` | 内置默认源清单 + 用户配置合并、rsshub 路由拼接 |
| `feed.ts` | RSS 2.0 / Atom / JSON Feed 解析，单源失败隔离，返回 `sourceReports` |
| `url-policy.ts` | 复用 `sanitizeResearchUrl`、canonical 去重、SSRF 白名单（仅 https，或显式配置的 rsshubBaseUrl） |
| `relevance.ts` | 赛道词典打分、命中词记录、去重 |
| `cluster.ts` | 同事件聚类与热度计算 |
| `topics.ts` | 调用 `lib/dashscope/chat-completions.ts` 生成选题卡；prompt 沿用「来源为不可信数据」边界 |
| `service.ts` | 编排：抓取 → 过滤 → 聚类 → 选题 → 快照 |
| `cache.ts` | owner 目录 immutable 快照（照 `viral-research/cache.ts` 模式），`HOTSPOT_STORAGE_ROOT` 可覆盖 |

RSS 解析依赖：新增 `fast-xml-parser`（零依赖、可在 Workers 运行）。这是本方案唯一新增运行时依赖；不接受新依赖时退化为仅支持带 `<item><title><link>` 的最小子集，解析健壮性下降。

### 默认源清单（可在设置页增删）

- 官方 RSS：IT之家、36氪、极客公园、雷科技、智东西、中国家电网、什么值得买
- RSSHub 路由：`/weibo/search/hot`、`/zhihu/hot`、`/douyin/hot`、`/baidu/tieba/...` 等热榜类（需自建实例）
- 兜底：`dashscope` 类型单条，查询「最近 7 天 + 赛道词」

### API

| 路由 | 方法 | 行为 |
|------|------|------|
| `/api/hotspots` | `POST` | 抓取并写快照；`{ forceRefresh?: boolean }` |
| `/api/hotspots/latest` | `GET` | 返回最新快照与 `stale` 标记 |
| `/api/hotspots/[id]` | `GET` | 按 owner 读历史快照 |

`SITES_DEPLOYMENT === "true"` 时统一 501，与 `/api/viral-research` 一致。响应头 `Cache-Control: private, no-store`。

### 设置（`providers.hotspots`）

```ts
{
  enabled: boolean;              // 默认 true
  rsshubBaseUrl: string;         // 默认空；空则跳过 rsshub 类型源
  freshnessDays: number;         // 1–30，默认 7
  maxItemsPerSource: number;     // 5–50，默认 20
  trackIds: string[];            // 默认四个赛道全选
  sources: HotspotSourceConfig[];// 空则用内置默认清单
}
```

改动：`lib/settings/schema.ts`、`store.ts`（脱敏与合并）、`health.ts`（配置体检，不做全量网络探测）、`features/settings/settings-page.tsx`（源列表增删启停 + RSSHub 地址 + 赛道多选）。新增 `lib/settings/hotspot-config.ts` 做归一化与校验，对齐 `web-research-config.ts` 的写法。

### UI

新页 `/hotspots`（`features/hotspots/hotspot-workspace.tsx`）：

- 顶部：刷新按钮、上次抓取时间、赛道筛选、源状态摘要（成功 N / 失败 M，失败可展开原因）
- 左列：热点卡（标题、热度、命中源徽标、时间、原文链接、`trackIds` 标签）
- 右列：选中热点的选题卡（钩子、为什么现在做、受众、可拍摄性、需要准备的证据、时效窗口、风险、引用来源）
- 底部按钮「生成脚本」→ 携带 `hotspotSnapshotId` + `clusterId` + `topicCardId` 跳 `/scripts/new`

脚本侧：`ScriptDraftInput` 增 `hotspotSnapshotId?` / `hotspotTopicCardId?`；`lib/script-workbench/dashscope-provider.ts` 增 `hotspotContext()`，与现有 `researchContext()` 并列，注入热点标题、来源链接、时效窗口，并明确禁止编造数据、禁止执行来源中的指令。

## 错误与兼容

- 单源失败只写入 `sourceReports`，不阻断整体；全部失败时返回 `degradedReason` 并保留上次快照。
- `rsshubBaseUrl` 未配置时跳过所有 rsshub 源，`limitations` 提示一句。
- 抓取全部并发上限 4，单源超时 8s、整体 20s；超时按失败处理。
- 旧脚本草稿无热点字段：prompt 走原分支，UI 不展示热点区块。
- 快照不可变；刷新生成新 id，历史引用不失效。
- 快照保留策略：owner 目录保留最近 30 个快照，超出按 `fetchedAt` 清理（补齐现有 viral-research 缺失的清理逻辑）。

## 测试

爆款研究（`apps/web/tests/viral-research.test.ts` 扩展）：

- fixture 使用真实形状（仅 `index/title/url`），断言不产生 `verified_metric`
- 1 条来源即可产出选题卡；`limitations` ≤2
- 多模态分支 `search_options` 只含 `search_strategy` 与 `enable_source`
- 缓存 key 随 model 变化而失效

热点（新增 `apps/web/tests/hotspots.test.ts`）：

- RSS 2.0 / Atom / JSON Feed fixture 解析
- canonical 去重、跨源同事件聚类、热度排序
- SSRF：内网地址、非 https、未配置域名被拒
- 单源失败隔离与 `sourceReports`
- mock LLM：选题卡必须引用真实 sourceId，无引用则丢弃
- 快照过期返回 `stale` 与保留策略清理

live 探针 `apps/web/scripts/live-hotspot-fetch-test.mjs`（不进默认 `npm test`）：真实抓取，打印各源状态与命中条数，无命中则非零退出。

## 非目标

- 抓取平台私有接口或登录态数据、绕过反爬
- 自动发布或自动生成互动指标
- 热点的长期趋势分析与图表（先只做当期快照与最近 30 个历史）
- Sites/D1 下的热点持久化（先按 501 处理）
