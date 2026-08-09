# Settings + Docker Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Docker launchers plus an in-app settings center (health checks, API keys, first-run wizard) so a non-technical recipient can run all features locally without installing Node/FFmpeg on the host.

**Architecture:** Package-root scripts detect/start Docker and `compose up`. Web persists `user-settings.json` on a shared volume; providers prefer that file over env. Health API probes Postgres, Worker `/health`, container ffmpeg/ffprobe, and storage writability. First visit shows a wizard; later `/settings` uses tabs.

**Tech Stack:** Next.js App Router, Zod, existing UI (`Button`/`Card`/`Badge`), Docker Compose, PowerShell-friendly `.bat` + macOS `.command`, Vitest.

## Global Constraints

- Platforms: Windows + macOS only (no iOS).
- Missing Docker: open official download page (do **not** bundle installer).
- No host install of Node/FFmpeg; FFmpeg must exist in **web** and **worker** images.
- API keys masked in GET responses (last 4 chars only).
- Provider resolution: `user-settings.json` first, then process env.
- Shared volume for settings; Worker reads the same file (no HTTP sync).
- Follow existing UI patterns (`AppShell`, overlay/`Card`, Chinese copy).

## File map

| Path | Responsibility |
|------|----------------|
| `启动.bat`, `启动.command`, `停止.bat`, `停止.command` | Docker detect/start/stop |
| `README-使用说明.md` | Recipient-facing steps |
| `docker-compose.yml` | Settings volume, `WORKER_URL`, `USER_SETTINGS_PATH` |
| `apps/web/Dockerfile` | Install ffmpeg/ffprobe in runner |
| `apps/web/lib/settings/schema.ts` | Zod types for settings file |
| `apps/web/lib/settings/store.ts` | Read/write/mask settings |
| `apps/web/lib/settings/credentials.ts` | Resolve keys/URLs for providers |
| `apps/web/lib/settings/health.ts` | Health check implementations |
| `apps/web/app/api/settings/health/route.ts` | GET health |
| `apps/web/app/api/settings/providers/route.ts` | GET/PUT providers + setup flags |
| `apps/web/app/settings/page.tsx` | Settings route |
| `apps/web/features/settings/*` | Wizard + tabs UI + setup banner |
| `apps/web/components/app-shell.tsx` | Gear link + banner slot |
| Provider files under `lib/script-workbench` / `lib/draft-review` | Use `credentials.ts` |
| `apps/worker/app/config.py` + settings load | Prefer user-settings.json for API keys |
| `apps/web/tests/user-settings.test.ts` | Store + mask + resolve tests |

---

### Task 1: Settings store + credentials + tests

**Files:**
- Create: `apps/web/lib/settings/schema.ts`
- Create: `apps/web/lib/settings/store.ts`
- Create: `apps/web/lib/settings/credentials.ts`
- Create: `apps/web/tests/user-settings.test.ts`

**Interfaces:**
- Produces: `UserSettings`, `defaultUserSettings()`, `loadUserSettings()`, `saveUserSettings()`, `maskUserSettings()`, `resolveDashScopeKey()`, `resolveDashScopeBaseUrl()`, `settingsPath()`

- [ ] **Step 1: Write failing tests** for default settings, mask (shows last 4), resolve prefers file over env, save round-trip to temp path via `USER_SETTINGS_PATH`.

- [ ] **Step 2: Implement schema/store/credentials** so tests pass.

- [ ] **Step 3: Run** `npm run test -w @video-diagnosis/web -- tests/user-settings.test.ts`

---

### Task 2: Health + providers API

**Files:**
- Create: `apps/web/lib/settings/health.ts`
- Create: `apps/web/app/api/settings/health/route.ts`
- Create: `apps/web/app/api/settings/providers/route.ts`

**Interfaces:**
- Produces: `GET /api/settings/health` → `{ checks: { id, ok, message }[] }`
- Produces: `GET/PUT /api/settings/providers` → masked settings; PUT accepts providers + `setupCompleted` / `dismissWizard`

- [ ] **Step 1: Implement health** — Postgres (`DATABASE_URL` if set), Worker (`WORKER_URL` default `http://127.0.0.1:8000`), `ffmpeg`/`ffprobe` via `execFile`, storage write under `PRIVATE_STORAGE_ROOT`.

- [ ] **Step 2: Implement providers routes** with Zod validation and mask on GET/PUT response.

---

### Task 3: Settings UI + AppShell

**Files:**
- Create: `apps/web/app/settings/page.tsx`
- Create: `apps/web/features/settings/settings-page.tsx`
- Create: `apps/web/features/settings/setup-banner.tsx`
- Modify: `apps/web/components/app-shell.tsx`

- [ ] **Step 1: Settings page** with first-run wizard (steps: health → API → done) when `!setupCompleted && !dismissWizard`; else tabs 环境检测 / API 配置 / 首次指引.

- [ ] **Step 2: AppShell** — Settings gear → `/settings`; render `SetupBanner` when wizard incomplete.

---

### Task 4: Wire providers + Worker + Docker assets

**Files:**
- Modify: dashscope/credential call sites in web to use `credentials.ts`
- Modify: `apps/worker/app/config.py` (and any speech/llm readers) to merge user-settings.json
- Modify: `apps/web/Dockerfile` — `apk add ffmpeg`
- Modify: `docker-compose.yml` — volume + env
- Create: launch/stop scripts + `README-使用说明.md`

- [ ] **Step 1: Web providers** read resolved credentials.
- [ ] **Step 2: Worker** loads `/app/.data/user-settings.json` (or `USER_SETTINGS_PATH`) over env.
- [ ] **Step 3: Docker/scripts/docs** as in spec.

---

### Task 5: Verify

- [ ] Run web unit tests for settings + existing dashscope tests if impacted.
- [ ] Run `npm run typecheck -w @video-diagnosis/web`.
- [ ] Smoke-read launchers and compose for path/env consistency vs spec.

## Spec coverage

| Spec item | Task |
|-----------|------|
| Launchers Win/Mac | 4 |
| Docker download redirect | 4 |
| Settings gear + wizard + tabs | 3 |
| Health API | 2 |
| API config + mask + persist | 1–2 |
| Provider prefer file | 1, 4 |
| Web image ffmpeg | 4 |
| Out of scope items | documented in README, not built |

## Execution note

Partner requested **直接实施** — execute inline in this session (executing-plans), no separate approval gate for this plan.
