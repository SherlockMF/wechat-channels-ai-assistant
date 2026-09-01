# 研究、平台适配与演讲攻略优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正热点/爆款研究正确性，建立可配置账号画像与平台策略，并给最终脚本生成可验证的演讲攻略。

**Architecture:** 设置层提供单工作区内容画像，平台目录集中描述策略；研究模块通过显式配置与上下文指纹隔离缓存；演讲攻略作为独立结构绑定最终口播块。所有新增字段保持旧数据兼容。

**Tech Stack:** TypeScript、Next.js、Zod、Vitest、DashScope。

## Global Constraints

- 不新增运行时依赖。
- 不实现或声称 OAuth、自动发布、指标同步。
- 不把演讲攻略追加进默认 `plainText`。
- 旧设置、稿件与研究快照必须可读。
- 用户配置和外部来源一律按不可信文本处理。

---

### Task 1: 账号画像与平台目录

**Files:**
- Modify: `apps/web/lib/settings/schema.ts`
- Create: `apps/web/lib/settings/content-profile.ts`
- Create: `apps/web/lib/platforms/catalog.ts`
- Modify: `apps/web/features/settings/settings-page.tsx`
- Test: `apps/web/tests/user-settings.test.ts`

**Interfaces:**
- Produces: `ContentProfileSettings`、`normalizeContentProfile()`、`platformLabel()`、`platformPromptGuidance()`。

- [ ] 写失败测试：旧设置得到默认画像，空白/重复关键词和平台被归一化，平台目录覆盖 8 个目标。
- [ ] 运行 `npm run test --workspace @video-diagnosis/web -- tests/user-settings.test.ts`，确认新增断言失败。
- [ ] 实现 schema、归一化和设置页“账号画像”标签，保存流程复用现有 API。
- [ ] 再跑同一测试并确认通过。

### Task 2: 脚本平台化与演讲攻略结构

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Create: `apps/web/lib/script-workbench/delivery-guide.ts`
- Modify: `apps/web/lib/script-workbench/mock-generate.ts`
- Modify: `apps/web/lib/script-workbench/production-guide.ts`
- Modify: `apps/web/lib/script-workbench/plain-text.ts`
- Modify: `apps/web/lib/script-workbench/dashscope-provider.ts`
- Modify: `apps/web/features/script-workbench/script-create-form.tsx`
- Modify: `apps/web/features/script-workbench/script-detail.tsx`
- Test: `apps/web/tests/script-workbench.test.ts`

**Interfaces:**
- Consumes: `normalizeContentProfile()` 与平台目录。
- Produces: `ScriptDeliveryGuide`、`ensureDeliveryGuide(output)`、`buildDeliveryGuidePromptContext()`。

- [ ] 写失败测试：旧输出兼容、koubo/follow 都生成攻略、攻略不进入 `plainText`、prompt 使用画像与目标平台。
- [ ] 运行脚本测试确认失败。
- [ ] 增加 `targetPlatforms?`、`platformOther?` 与 `deliveryGuide?` schema；实现安全归一化和中性 fallback。
- [ ] 更新模型 JSON 约束、两轮质检规则、mock、表单和详情排练卡。
- [ ] 修正再生成输入，避免整份导出文本污染正文。
- [ ] 运行脚本测试确认通过。

### Task 3: 爆款研究缓存、样本与证据闭环

**Files:**
- Modify: `apps/web/lib/viral-research/types.ts`
- Modify: `apps/web/lib/viral-research/cache.ts`
- Modify: `apps/web/lib/viral-research/service.ts`
- Modify: `apps/web/lib/viral-research/samples.ts`
- Modify: `apps/web/lib/viral-research/dashscope.ts`
- Modify: `apps/web/features/script-workbench/script-research-panel.tsx`
- Test: `apps/web/tests/viral-research.test.ts`

**Interfaces:**
- Produces: cache `contextFingerprint`、平台化 query、只引用最终 items 的 topic cards。

- [ ] 写失败测试覆盖无指标样本、主题不相关样本、上下文变更缓存失效、过期/未来来源、悬空 sourceId。
- [ ] 运行爆款测试确认失败。
- [ ] 在读取缓存前加载历史/样本并计算稳定指纹；平台进入 query 与 prompt。
- [ ] 修正样本分级/过滤、来源排序和卡片引用闭环；补 UI 证据解释。
- [ ] 运行爆款测试确认通过。

### Task 4: 热点自定义主题与可解释评分

**Files:**
- Modify: `apps/web/lib/settings/schema.ts`
- Modify: `apps/web/lib/settings/hotspot-config.ts`
- Modify: `apps/web/features/settings/hotspot-section.tsx`
- Modify: `apps/web/lib/hotspots/types.ts`
- Modify: `apps/web/lib/hotspots/relevance.ts`
- Modify: `apps/web/lib/hotspots/cluster.ts`
- Modify: `apps/web/lib/hotspots/topics.ts`
- Modify: `apps/web/features/hotspots/hotspot-workspace.tsx`
- Modify: `packages/shared-types/src/index.ts`
- Test: `apps/web/tests/hotspots.test.ts`
- Test: `apps/web/tests/hotspot-settings.test.ts`

**Interfaces:**
- Produces: `customKeywords`、`HotspotCluster.confidence`、`HotspotCluster.scoreBreakdown`。

- [ ] 写失败测试覆盖自定义关键词、未来时间、无日期置信度和 A≈B≈C 单链误并。
- [ ] 运行热点测试确认失败。
- [ ] 实现关键词匹配、时间卫生、代表标题约束、分数拆解与画像化选题 prompt。
- [ ] 更新设置/UI，展示“高/中/低置信度”和分数来源。
- [ ] 运行热点与设置测试确认通过。

### Task 5: 对抗审查与完整验证

**Files:**
- Review: `packages/shared-types/src/index.ts`
- Review: `apps/web/lib/settings/schema.ts`
- Review: `apps/web/lib/script-workbench/dashscope-provider.ts`
- Review: `apps/web/lib/viral-research/service.ts`
- Review: `apps/web/lib/hotspots/{relevance,cluster,topics}.ts`

**Interfaces:**
- Consumes: Tasks 1-4 的最终 diff。
- Produces: 无悬空引用、无硬编码回归、无测试/类型/构建失败的交付。

- [ ] 搜索 `恒远|开远|视频号短视频主编` 并确认仅保留兼容默认值或产品说明。
- [ ] 对抗检查未来时间、空指标、重复词、emoji、中英数字、多平台空选择和旧数据。
- [ ] 运行相关测试、全量 `npm test`、`npm run typecheck`、`npm run build`。
- [ ] 检查 `git diff --check` 与 `git diff --stat`，修正审查发现后重跑受影响验证。
