# Script Production Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add whole-script shoot status (shot/unshot) to script creation and generate an independent production guide (materials or storyboard + edit tips).

**Architecture:** Extend shared Zod schemas; mock + DashScope providers fill `productionGuide`; form collects status; detail renders a new card; plainText appends the section.

**Tech Stack:** Next.js, Zod shared-types, Vitest, existing script-workbench providers.

## Global Constraints

- Both koubo and follow pipelines.
- Whole-script status only; chosen at create time.
- Independent output block; do not reshape existing timeline/broll.
- Backward compatible: missing fields default to unshot / omit UI section.

---

### Task 1: Shared types + plainText + mock + tests

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Modify: `apps/web/lib/script-workbench/plain-text.ts`
- Modify: `apps/web/lib/script-workbench/mock-generate.ts`
- Modify: `apps/web/tests/script-workbench.test.ts`

- [ ] Add shootStatus / productionGuide schemas and wire into input/output
- [ ] Append production guide to plainText
- [ ] Build productionGuide in mock for shot and unshot
- [ ] Update/add vitest cases; run tests

### Task 2: LLM prompt + UI

**Files:**
- Modify: `apps/web/lib/script-workbench/dashscope-provider.ts`
- Modify: `apps/web/features/script-workbench/script-create-form.tsx`
- Modify: `apps/web/features/script-workbench/script-detail.tsx`

- [ ] Extend schemaHint and prompt with shoot status / material notes / productionGuide
- [ ] Form: shoot status radios + optional materialNotes
- [ ] Detail: production guide card
- [ ] Re-run script-workbench tests
