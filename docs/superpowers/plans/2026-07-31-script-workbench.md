# Script Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship LOCAL-mode「脚本工作台」before 发布前审片: dual pipelines (口播 / 跟拍成片), archive, copy, regenerate.

**Architecture:** `ScriptDraft` in shared-types + `.data/local-state.json`; generate via mock/DashScope providers; Next.js pages under `/scripts` mirroring draft-review UX patterns.

**Tech Stack:** Next.js App Router, Zod, Vitest, existing LocalRepository / DashScope env, Lucide + shared UI components.

## Global Constraints

- Follow `docs/superpowers/specs/2026-07-31-script-workbench-design.md` exactly for formats, topics, Vlog-optional topic, and dual pipelines.
- LOCAL only for persistence (Cloud/Postgres stub `scriptWorkbenchUnsupported` like draft review).
- No draft-review hard link; no video upload; no Jianying export.
- Regenerate saves a **new** `ScriptDraft` (keep old).
- Chinese UI copy; identifiers in English.

## File map

| Path | Responsibility |
|------|----------------|
| `packages/shared-types/src/index.ts` | ScriptDraft enums, input/output schemas, types |
| `apps/web/lib/data/types.ts` | `scriptDrafts` on AppState |
| `apps/web/lib/data/local-repository.ts` | CRUD + generate |
| `apps/web/lib/data/cloud-repository.ts` / `postgres-repository.ts` | Unsupported stubs |
| `apps/web/lib/script-workbench/catalog.ts` | Format/topic labels + validation helpers |
| `apps/web/lib/script-workbench/plain-text.ts` | Structured output → copyable text |
| `apps/web/lib/script-workbench/mock-generate.ts` | Deterministic mock generator |
| `apps/web/lib/script-workbench/provider.ts` | resolve mock / dashscope |
| `apps/web/lib/script-workbench/dashscope-provider.ts` | LLM JSON generation |
| `apps/web/lib/script-workbench/references.ts` | Optional similar history from imports |
| `apps/web/app/api/scripts/route.ts` | GET list, POST create+generate |
| `apps/web/app/api/scripts/[scriptId]/route.ts` | GET/PATCH/DELETE |
| `apps/web/app/api/scripts/[scriptId]/regenerate/route.ts` | POST → new draft |
| `apps/web/features/script-workbench/*` | List, new form, detail UI |
| `apps/web/app/scripts/**` | Pages |
| `apps/web/components/app-shell.tsx` | Nav first item |
| `apps/web/tests/script-workbench.test.ts` | Unit tests |

---

### Task 1: Shared types + AppState

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Modify: `apps/web/lib/data/types.ts`
- Modify: `apps/web/lib/data/local-source.ts` (preserve empty `scriptDrafts` if needed)
- Test: `apps/web/tests/script-workbench.test.ts`

**Produces:** `ScriptDraft`, format/topic enums, `scriptDraftInputSchema`, `scriptDraftOutputSchema`

- [ ] **Step 1: Add failing test for schema parse**

```ts
import { describe, expect, it } from "vitest";
import {
  scriptDraftFormatSchema,
  scriptDraftOutputSchema,
} from "@video-diagnosis/shared-types";

describe("script draft schemas", () => {
  it("accepts koubo output shape", () => {
    const parsed = scriptDraftOutputSchema.parse({
      pipeline: "koubo",
      titles: ["标题A", "标题B"],
      tags: ["全屋净水"],
      script: "口播正文",
      brollCues: [{ section: "开头", cue: "软水起泡特写" }],
      subtitleBeats: ["用了就离不开"],
      altHooks: ["谁懂硬水的痛"],
      positioning: null,
      timeline: [],
      gapsOrWarnings: [],
      plainText: "口播正文",
    });
    expect(parsed.pipeline).toBe("koubo");
  });

  it("accepts vlog format enum", () => {
    expect(scriptDraftFormatSchema.parse("vlog")).toBe("vlog");
  });
});
```

- [ ] **Step 2: Run test — expect fail (exports missing)**

Run: `npm test --workspace=@video-diagnosis/web -- tests/script-workbench.test.ts`

- [ ] **Step 3: Implement types**

Add to `packages/shared-types/src/index.ts`:

```ts
export const scriptDraftFormatSchema = z.enum([
  "koubo",
  "showroom_koubo",
  "service_intro",
  "project_finish",
  "hydro_site",
  "service_process",
  "vlog",
]);
export const scriptDraftTopicSchema = z.enum([
  "smart_home",
  "water",
  "hydro",
  "service",
]);
export const scriptDraftSmartSubTopicSchema = z.enum([
  "lighting",
  "curtain",
  "theater",
  "voice",
  "panel",
  "security",
  "scene",
]);
export const scriptDraftProcessKindSchema = z.enum([
  "plan_meeting",
  "install_inspect",
  "progress_check",
]);
export const scriptDraftStatusSchema = z.enum(["draft", "ready"]);
export const scriptDraftPipelineSchema = z.enum(["koubo", "follow"]);

export const scriptDraftInputSchema = z.object({
  idea: z.string().min(1),
  sellingPoints: z.string().optional(),
  targetSeconds: z.number().int().positive().optional(),
  tone: z.enum(["casual", "dry"]).optional(),
  projectType: z.string().optional(),
  shotNotes: z.string().optional(),
  highlight: z.string().optional(),
  siteNotes: z.string().optional(),
  standardPoints: z.string().optional(),
  processKinds: z.array(scriptDraftProcessKindSchema).optional(),
  clientScene: z.string().optional(),
  mustShoot: z.string().optional(),
  dayPlan: z.string().optional(),
  internalNote: z.string().optional(),
});

export const scriptDraftOutputSchema = z.object({
  pipeline: scriptDraftPipelineSchema,
  titles: z.array(z.string()),
  tags: z.array(z.string()),
  script: z.string(),
  brollCues: z.array(z.object({ section: z.string(), cue: z.string() })),
  subtitleBeats: z.array(z.string()),
  altHooks: z.array(z.string()),
  positioning: z.string().nullable(),
  timeline: z.array(
    z.object({
      order: z.number().int(),
      shoot: z.string(),
      say: z.string(),
      subtitle: z.string(),
    }),
  ),
  gapsOrWarnings: z.array(z.string()),
  plainText: z.string(),
});

export interface ScriptDraft {
  id: string;
  ownerId: string;
  format: z.infer<typeof scriptDraftFormatSchema>;
  topic: z.infer<typeof scriptDraftTopicSchema> | null;
  subTopics: Array<z.infer<typeof scriptDraftSmartSubTopicSchema>>;
  processKinds: Array<z.infer<typeof scriptDraftProcessKindSchema>>;
  title: string | null;
  ideaSummary: string;
  input: z.infer<typeof scriptDraftInputSchema>;
  output: z.infer<typeof scriptDraftOutputSchema> | null;
  status: z.infer<typeof scriptDraftStatusSchema>;
  provider: string | null;
  referenceVideoIds: string[];
  createdAt: string;
  updatedAt: string;
}
```

Add `scriptDrafts: ScriptDraft[]` to `AppState` / `emptyState`.

- [ ] **Step 4: Re-run test — pass**
- [ ] **Step 5: Commit** `feat: add ScriptDraft shared types`

---

### Task 2: Catalog helpers + plain text + mock generator

**Files:**
- Create: `apps/web/lib/script-workbench/catalog.ts`
- Create: `apps/web/lib/script-workbench/plain-text.ts`
- Create: `apps/web/lib/script-workbench/mock-generate.ts`
- Test: extend `script-workbench.test.ts`

**Produces:** `isKouboFormat()`, `topicRequired()`, `buildMockScriptOutput()`, `outputToPlainText()`

- [ ] **Step 1: Failing tests**

```ts
import { topicRequired, isKouboFormat } from "@/lib/script-workbench/catalog";
import { buildMockScriptOutput } from "@/lib/script-workbench/mock-generate";

it("vlog does not require topic", () => {
  expect(topicRequired("vlog")).toBe(false);
  expect(isKouboFormat("koubo")).toBe(true);
});

it("mock koubo returns script and plainText", () => {
  const out = buildMockScriptOutput({
    format: "koubo",
    topic: "water",
    subTopics: [],
    processKinds: [],
    input: { idea: "软水机离不开" },
  });
  expect(out.pipeline).toBe("koubo");
  expect(out.script.length).toBeGreaterThan(10);
  expect(out.plainText).toContain("软水");
});

it("mock service_process returns timeline", () => {
  const out = buildMockScriptOutput({
    format: "service_process",
    topic: "hydro",
    subTopics: [],
    processKinds: ["install_inspect"],
    input: { idea: "验水电标准", mustShoot: "线管间距" },
  });
  expect(out.pipeline).toBe("follow");
  expect(out.timeline.length).toBeGreaterThan(2);
});
```

- [ ] **Step 2: Implement catalog + mock + plain-text** (koubo vs follow branches; Vlog light timeline; service_process warnings)
- [ ] **Step 3: Tests pass**
- [ ] **Step 4: Commit** `feat: add script workbench mock generator`

---

### Task 3: Provider + optional references

**Files:**
- Create: `apps/web/lib/script-workbench/references.ts`
- Create: `apps/web/lib/script-workbench/provider.ts`
- Create: `apps/web/lib/script-workbench/dashscope-provider.ts`

**Produces:** `resolveScriptProvider()`, `findScriptReferences(records, topic, idea)`

- [ ] DashScope: text-only chat/completions, parse JSON with `scriptDraftOutputSchema`, fallback plainText via `outputToPlainText`
- [ ] resolve: dashscope if credentials else mock
- [ ] references: skip when format is vlog and topic null; else tag/title match top 3
- [ ] Commit `feat: add script workbench LLM provider`

---

### Task 4: Repository CRUD + generate

**Files:**
- Modify: `local-repository.ts`, `cloud-repository.ts`, `postgres-repository.ts`, `local-source.ts` merge of `scriptDrafts`

**Produces:**

```ts
listScriptDrafts(ownerId): Promise<ScriptDraft[]>
getScriptDraft(ownerId, id): Promise<ScriptDraft | null>
createScriptDraft(ownerId, draft): Promise<ScriptDraft>
updateScriptDraft(ownerId, id, patch): Promise<ScriptDraft | null>
deleteScriptDraft(ownerId, id): Promise<boolean>
generateScriptDraft(ownerId, params): Promise<ScriptDraft> // create + generate
regenerateScriptDraft(ownerId, id): Promise<ScriptDraft> // new record from old input
```

- [ ] Preserve `scriptDrafts` when reloading local source fingerprint (same as draftReviews)
- [ ] Cloud/Postgres: `scriptWorkbenchUnsupported()`
- [ ] Commit `feat: persist script drafts in local repository`

---

### Task 5: API routes

**Files:**
- Create: `apps/web/app/api/scripts/route.ts`
- Create: `apps/web/app/api/scripts/[scriptId]/route.ts`
- Create: `apps/web/app/api/scripts/[scriptId]/regenerate/route.ts`

- [ ] GET `/api/scripts` → `{ items }`
- [ ] POST `/api/scripts` JSON body: format, topic?, subTopics?, processKinds?, input → generate
- [ ] Validate: if `topicRequired(format)` and !topic → 400
- [ ] GET/PATCH/DELETE by id; PATCH may update title/input/output/status
- [ ] POST regenerate → 201 new draft
- [ ] Commit `feat: add script workbench API routes`

---

### Task 6: UI pages + nav

**Files:**
- Create: `features/script-workbench/script-list.tsx`, `script-create-form.tsx`, `script-detail.tsx`
- Create: `app/scripts/page.tsx`, `new/page.tsx`, `[scriptId]/page.tsx`
- Modify: `components/app-shell.tsx` — insert 脚本工作台 first (`/scripts`, PenLine or ScrollText icon)

- [ ] List: filter format/topic, copy plainText, link detail, delete
- [ ] New: format → topic (optional for vlog) → dynamic fields by format → submit
- [ ] Detail: show structured sections + plainText, copy buttons, edit save, regenerate
- [ ] Commit `feat: add script workbench UI and nav`

---

### Task 7: Verify

- [ ] `npm test --workspace=@video-diagnosis/web -- tests/script-workbench.test.ts`
- [ ] `npm run typecheck --workspace=@video-diagnosis/web`
- [ ] Manual: `/scripts/new` Vlog without topic succeeds; koubo without topic fails

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| 7 formats, Vlog topic optional | 1, 2, 5, 6 |
| Dual pipeline koubo/follow | 2, 3 |
| Service process full | 2, 6 |
| Archive list/filter/copy | 4, 5, 6 |
| Regenerate new record | 4, 5 |
| Nav before review | 6 |
| mock + LLM | 3 |
| No draft-review hard link | Global |
