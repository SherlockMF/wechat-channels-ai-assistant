# 热点研究与爆款研究改造：实施计划

> 设计文档：`docs/superpowers/specs/2026-08-28-hotspot-and-viral-research-design.md`

**目标：** 先把爆款研究改成可用的「主题证据检索」，再新增「研究热点 → 赛道选题」，最后补人工爆款样本库。

**架构：** 共享赛道词典下沉到 `lib/tracks`；爆款研究沿用现有 DashScope 适配器与私有快照缓存；热点模块新建 `lib/hotspots`，复用 owner immutable 快照模式；热点选题通过 `ScriptDraftInput` 进入脚本工作台。

**技术栈：** Next.js、Zod shared-types、Vitest、DashScope 原生 API、fast-xml-parser、自建 RSSHub（Docker）。

## 全局约束

- 赛道：智能家居/全屋智能、净水、装修水电、家电新品/家庭影院。
- 系统不生成任何互动指标；真实指标只来自人工录入。
- 单源失败不阻断整体；每次抓取整体 ≤20s。
- Sites/D1 统一 501，不静默降级。
- 向后兼容：旧快照与旧草稿必须仍可解析、可展示。

---

## 阶段 0：确诊（先于任何改造）

### Task 1: 真实返回落成 fixture

**文件：**
- 运行：`apps/web/scripts/live-viral-research-test.mjs`
- 新增：`apps/web/tests/fixtures/dashscope-search-info.json`
- 修改：`apps/web/tests/viral-research.test.ts`

- [ ] 用真实 Key 跑探针，记录 `search_results` 实际字段、耗时、状态
- [ ] 把真实返回脱敏后存为 fixture
- [ ] 用 fixture 重写现有 mock，确认当前代码在真实形状下确实产出 0 张有效选题卡（复现问题）

---

## 阶段 1：爆款研究改造

### Task 2: 共享赛道词典 + 证据分级

**文件：**
- 新增：`apps/web/lib/tracks/dictionary.ts`
- 修改：`packages/shared-types/src/index.ts`
- 修改：`apps/web/lib/viral-research/source-policy.ts`
- 修改：`apps/web/lib/viral-research/service.ts`

- [ ] 词典含四赛道的 id、展示名、关键词扩展、所需证据模板
- [ ] `viralResearchEvidenceLevelSchema` 增 `platform_page` / `media_article`，保留旧值
- [ ] 选题卡 schema 增 `evidenceStrength`，移除标题前缀重写逻辑
- [ ] `source-policy` 改用共享词典；删除依赖空摘要的 bigram 判定
- [ ] `evidenceRequirements()` 改读词典

### Task 3: 适配器参数与来源判定

**文件：**
- 修改：`apps/web/lib/viral-research/dashscope.ts`
- 修改：`apps/web/tests/viral-research.test.ts`

- [ ] 文本路径：`forced_search + search_strategy:"max" + enable_source + freshness`，超时 30s
- [ ] 多模态路径：`search_options` 只留 `search_strategy:"agent"` 与 `enable_source`，超时 60s
- [ ] 删除从 `search_results` 提取互动指标的路径
- [ ] `analysisSchema` 增 `sourceJudgements`（index / relevant / kind / reason）
- [ ] 按 URL 域名给出 `platform_page` / `media_article` / `public_source` 兜底分级
- [ ] prompt 增加打标要求；用 fixture 断言参数与解析

### Task 4: 服务层门槛、文案与缓存

**文件：**
- 修改：`apps/web/lib/viral-research/service.ts`
- 修改：`apps/web/lib/viral-research/cache.ts`
- 修改：`apps/web/lib/viral-research/types.ts`
- 修改：`apps/web/tests/viral-research.test.ts`

- [ ] 选题卡门槛降为来源 ≥1 条，最多 3 张，带 `evidenceStrength`
- [ ] `limitations` 压到 ≤2 条人话，技术细节只进 `degradedReason`
- [ ] 缓存 key 加入 model；TTL 提到 72h；过期返回 `stale: true`
- [ ] owner 目录保留最近 30 个快照，超出按 `fetchedAt` 清理
- [ ] 测试：1 条来源即出卡、无 `verified_metric`、换 model 缓存失效

### Task 5: 研究面板体验

**文件：**
- 修改：`apps/web/features/script-workbench/script-research-panel.tsx`

- [ ] 移除自动发起检索，改为「开始研究」按钮
- [ ] 两步进度提示（检索公开来源 / 整理选题角度）
- [ ] 分组改「平台内容 / 行业资料 / 本账号历史」，空组不渲染
- [ ] 证据强度徽章；失败提示改人话，设置引导折叠

---

## 阶段 2：热点 MVP（官方 RSS + 手动刷新）

### Task 6: 类型、源清单与抓取解析

**文件：**
- 修改：`packages/shared-types/src/index.ts`
- 新增：`apps/web/lib/hotspots/{types,sources,feed,url-policy}.ts`
- 新增：`apps/web/tests/hotspots.test.ts`
- 新增：`apps/web/tests/fixtures/{rss2,atom,jsonfeed}.xml|json`
- 修改：`apps/web/package.json`（新增 `fast-xml-parser`）

- [ ] Hotspot 系列 Zod schema（source / item / cluster / topicCard / snapshot）
- [ ] 内置默认源清单 + 用户配置合并 + rsshub 路由拼接
- [ ] RSS 2.0 / Atom / JSON Feed 解析，并发 4、单源超时 8s、响应上限 2MB
- [ ] SSRF 白名单（仅 https 或显式 rsshubBaseUrl）、canonical 去重
- [ ] 测试：三种格式解析、去重、内网/非 https 被拒、单源失败隔离

### Task 7: 赛道过滤、聚类、选题与快照

**文件：**
- 新增：`apps/web/lib/hotspots/{relevance,cluster,topics,service,cache}.ts`
- 修改：`apps/web/tests/hotspots.test.ts`

- [ ] 赛道词典打分与命中词记录
- [ ] 标题相似度 ≥0.45 且时间差 ≤72h 聚类；热度按设计公式
- [ ] 选题卡生成：注入不可信来源边界，要求引用 ≥1 条真实 sourceId，无引用则丢弃
- [ ] owner immutable 快照 + TTL 8h + 保留最近 30 个
- [ ] 测试：跨源聚类、热度排序、mock LLM 引用校验、过期 `stale`

### Task 8: API 路由

**文件：**
- 新增：`apps/web/app/api/hotspots/route.ts`
- 新增：`apps/web/app/api/hotspots/latest/route.ts`
- 新增：`apps/web/app/api/hotspots/[id]/route.ts`

- [ ] `POST` 抓取刷新、`GET latest` 读当期、`GET [id]` 读历史
- [ ] Sites 统一 501；`Cache-Control: private, no-store`；owner 校验
- [ ] Zod 校验失败 400，其余 500，错误文案人话

### Task 9: 设置块与设置页

**文件：**
- 修改：`apps/web/lib/settings/schema.ts`
- 修改：`apps/web/lib/settings/store.ts`
- 修改：`apps/web/lib/settings/health.ts`
- 新增：`apps/web/lib/settings/hotspot-config.ts`
- 修改：`apps/web/features/settings/settings-page.tsx`

- [ ] `providers.hotspots` schema 与默认值
- [ ] 归一化与校验（URL 白名单、条数与天数区间、rsshub 地址）
- [ ] health 只做配置体检，不做全量网络探测
- [ ] 设置页：源列表增删启停、RSSHub 地址、赛道多选、时效与条数

### Task 10: 热点页与脚本联动

**文件：**
- 新增：`apps/web/app/hotspots/page.tsx`
- 新增：`apps/web/features/hotspots/hotspot-workspace.tsx`
- 修改：`packages/shared-types/src/index.ts`（`ScriptDraftInput` 增热点字段）
- 修改：`apps/web/lib/script-workbench/dashscope-provider.ts`
- 修改：`apps/web/features/script-workbench/script-create-form.tsx`
- 修改：`apps/web/app/layout.tsx`（导航入口）
- 修改：`apps/web/tests/script-workbench.test.ts`

- [ ] 热点页：刷新、源状态摘要、赛道筛选、热点列表、选题卡详情
- [ ] 过期快照打开页面时自动刷新，并展示上次抓取时间
- [ ] 「生成脚本」携带 `hotspotSnapshotId` / `clusterId` / `topicCardId` 跳新建页
- [ ] `hotspotContext()` 注入 prompt，与 `researchContext()` 并列，禁止编造数据
- [ ] 测试：热点上下文进 prompt、旧草稿无字段不报错

---

## 阶段 3：RSSHub 与定时（按需）

### Task 11: 自建 RSSHub 与热榜源

**文件：**
- 新增：`docker-compose.rsshub.yml`
- 修改：`apps/web/lib/hotspots/sources.ts`
- 修改：`README-使用说明.md`

- [ ] rsshub + redis（热榜路由需 browserless）compose 配置与健康检查
- [ ] 默认热榜源：微博热搜、知乎热榜、抖音热搜等，标记需 RSSHub
- [ ] 使用说明：启动步骤、端口、在设置页填写 `rsshubBaseUrl`
- [ ] live 探针 `apps/web/scripts/live-hotspot-fetch-test.mjs`

### Task 12: 可选定时刷新

**文件：**
- 修改：`apps/web/app/api/hotspots/route.ts`
- 新增：`scripts/schedule-hotspot-refresh.ps1`

- [ ] 支持带 token 的无会话刷新（token 从环境变量读，缺省则拒绝）
- [ ] Windows 计划任务脚本与说明；不改默认手动触发行为

---

## 阶段 4：爆款样本库（可选）

### Task 13: 人工录入与结构拆解

**文件：**
- 修改：`packages/shared-types/src/index.ts`
- 修改：`apps/web/lib/data/types.ts`
- 修改：`apps/web/lib/data/local-repository.ts`
- 新增：`apps/web/app/api/viral-samples/route.ts`
- 新增：`apps/web/features/viral-research/viral-sample-form.tsx`

- [ ] `viralSamples` 集合：URL、标题、平台、真实指标（可选）、备注、`metricsSource: "manual"`
- [ ] 录入表单与列表；样本可被研究面板选为参考
- [ ] 可选：样本视频投入审片管线产出结构拆解
- [ ] REAL/Sites 明确未支持提示，不静默降级

---

## 验收标准

| 项 | 标准 |
|----|------|
| 爆款研究 | 四个赛道任意主题都有 ≥5 条可点开来源、1–3 张选题卡；免责声明 ≤2 条；单次 ≤30s，缓存命中 <1s |
| 热点抓取 | ≥6 个源可用；单次 ≤20s；赛道命中 ≥15 条；聚类 5–10 个热点 |
| 热点选题 | 每个热点 ≥1 张选题卡，均引用真实来源，可一键进脚本 |
| 兼容 | 旧快照与旧草稿正常展示；Sites 明确 501 |
| 测试 | `npm test` 全绿；两个 live 探针人工跑通 |
