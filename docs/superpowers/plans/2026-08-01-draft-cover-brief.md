# 审片封面方案 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or implement task-by-task with TDD.

**Goal:** 审片详情可上传背景图+描述，生成生图提示词/标题/排版说明并保留历史。

**Architecture:** `DraftCoverBrief` + LOCAL 仓库 + CoverBriefProvider（DashScope/Mock）+ 详情页面板。

**Tech Stack:** Next.js、shared-types、local-repository、Vitest、现有 DashScope vision

## Tasks

### Task 1: 类型 + Mock Provider 解析（TDD）
### Task 2: 存储 + LOCAL 仓库 CRUD
### Task 3: API routes
### Task 4: 详情页 UI 面板
### Task 5: 测试与 typecheck
