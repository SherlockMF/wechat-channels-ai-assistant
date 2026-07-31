# 审片多版本上传 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 同一条发布前审片会话支持最多 5 个视频版本，新版完整诊断并附带相对上一版的改版对照。

**Architecture:** `DraftReview` 为会话；`DraftReviewVersion` 存每版媒体与状态；`DraftReviewResult` 挂 versionId 并可选 `changelog`。LOCAL 优先完整实现；cloud/postgres 抛未实现或桩方法对齐接口。

**Tech Stack:** Next.js App Router、shared-types、local-repository、Vitest

## Global Constraints

- 每会话最多 5 版本
- 对照为规则匹配，不强制二次 LLM
- 新版元数据默认沿用可改
- 单栏 + 版本 chip；对照块在报告上方

---

## File map

- `packages/shared-types/src/index.ts` — Version / changelog / Result 字段
- `apps/web/lib/draft-review/changelog.ts` — 对照生成
- `apps/web/lib/data/types.ts` + repositories — 持久化与 process/addVersion
- `apps/web/app/api/draft-reviews/**` — versions API、GET version 查询
- `apps/web/features/draft-review/**` — 详情 chip、上传新版、列表共 N 版
- `apps/web/tests/draft-review-versions.test.ts` — 单元/仓库行为

## Tasks

### Task 1: changelog 纯函数 + 类型

- [ ] 写失败测试：improved/remaining/newIssues
- [ ] 实现 `buildVersionChangelog(prev, next)`
- [ ] 扩展 shared-types

### Task 2: LOCAL 仓库多版本

- [ ] 测试：v1 创建、v2 上传、满 5、删版本回退、结果按 version
- [ ] 实现 versions 集合、迁移旧数据、addVersion/processVersion

### Task 3: API

- [ ] POST `/versions`、GET `?version=`、DELETE version、reanalyze 按 version
- [ ] video/cover 按当前/指定 version

### Task 4: UI

- [ ] 详情 chip + 上传新版 + 对照块
- [ ] 列表显示共 N 版

### Task 5: 验证

- [ ] 跑相关 vitest
