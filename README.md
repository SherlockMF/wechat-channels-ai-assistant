# WeChat Channels AI Assistant · 微信视频号 AI 创作助手

面向微信视频号创作者的本地优先工作台，整合 **AI 脚本生成、发布前视频审片、视频数据分析、热点选题与爆款研究**。支持 Excel 数据导入、本地视频匹配，以及可编辑、可复制、可导出的 Markdown 诊断报告。

A local-first AI assistant for WeChat Channels creators: script writing, pre-publish video review, Excel analytics, trending topics, and viral content research. Built with Next.js, React, TypeScript, FastAPI, FFmpeg, and DashScope / Qwen.

- GitHub：[SherlockMF/wechat-channels-ai-assistant](https://github.com/SherlockMF/wechat-channels-ai-assistant)
- 原项目名：视频号内容诊断助手；原仓库名：`shipinhao`。
- 文档：[使用说明](README-使用说明.md) · [技术方案](docs/TECHNICAL_PLAN.md) · [热点数据源与 RSSHub](docs/HOTSPOT_SOURCES.md)

本项目是独立工具，非微信或腾讯官方产品。仓库提供程序源码，不包含个人视频、业务工作簿或 API 密钥。

## 功能入口

| 功能 | 入口 | 用途 |
| --- | --- | --- |
| 脚本工作台 | `/scripts` | 生成口播、跟拍大纲与拍摄剪辑指导，保留草稿与再生成记录 |
| 发布前审片 | `/review` | 上传待发布视频，查看审片报告、版本对比与封面建议 |
| 数据导入与匹配 | `/imports/new` | 导入视频号 Excel 数据并匹配本地视频 |
| 数据分析 | `/analysis` | 按发布时间选择视频，运行诊断并编辑报告 |
| 热点与爆款研究 | `/hotspots` | 结合 RSS、RSSHub 与联网检索寻找选题和参考内容 |
| 设置 | `/settings` | 配置 AI Provider、模型与研究数据源 |

## 快速开始

准备 Git、Node.js **22.12+（22.x）或 24.x** 和 npm。脚本工作台无需 PostgreSQL、Worker 或样例 Excel；不配置 AI 密钥时使用明确标注的本地 mock 模板。视频媒体处理需要 FFmpeg / ffprobe，RSSHub 热榜需要 Docker。

```bash
git clone https://github.com/SherlockMF/wechat-channels-ai-assistant.git
cd wechat-channels-ai-assistant
npm ci
npm run dev
```

打开 `http://localhost:3000/scripts` 体验脚本工作台；需要真实 AI 生成时，在 `/settings` 配置 Provider 与 API Key。Windows PowerShell 若阻止 `npm.ps1`，可将上述 `npm` 替换为 `npm.cmd`。

也可从仓库页面选择 **Code → Download ZIP**。解压后，Windows 用户运行 `一键启动.bat`，Mac 用户按照[使用说明](README-使用说明.md)启动。Windows 一键脚本会尝试安装并启动 Docker / RSSHub；仅体验脚本工作台可使用上面的 npm 命令。

## 配置自己的数据

未配置本地工作簿或视频时，仍可使用脚本工作台。需要分析已有视频号数据时，可通过导入入口上传，或设置 `LOCAL_SOURCE_WORKBOOK` 和 `LOCAL_VIDEO_DIRECTORY` 指向自己的文件，配置示例见下方 LOCAL 模式。

源工作簿和视频保持只读，分析任务与报告编辑稿单独保存到 `.data/local-state.json`。工作簿或视频目录发生变化后，应用会按文件大小和修改时间重新同步，同时尽量保留仍可关联的分析结果。旧交付包的默认数据路径继续兼容，新用户应显式配置自己的路径。

## 已实现的核心闭环

- 读取工作表 `视频号数据明细`，识别 19 个中文字段。
- Excel 日期序列、字符串日期、百分比、带分隔符数字与 `NULL` 处理。
- 同一导入内视频 ID 去重，错误保留行号与字段；支持回滚导入。
- MP4/MOV/WebM 批量上传、扩展名/MIME/大小/数量校验、私有路径存储。
- 平台 ID、标题完全一致、包含关系、中文 bigram Dice 与 Levenshtein 匹配。
- `>=0.88` 自动匹配，`0.70～0.88` 人工确认，接近候选不强制确认。
- 分析队列严格 `published_at DESC, spreadsheet_row ASC`，支持最近 5/10/20、全部及手选。
- 账号整体与最近 10 条基线、Q1/Q2/Q3、派生互动率和样本置信度。
- FastAPI Worker 轮询数据库任务，ffprobe、音频提取、密集/稀疏关键帧、可替换转写/视觉 Provider。
- Zod/Pydantic 结构化诊断；无 AI 时保留规则诊断。
- 视频诊断页面分开显示数据事实、合理推断与执行动作。
- 报告编辑、保存、复制和 Markdown 导出；刷新后数据仍保留。
- **脚本工作台**（`/scripts`）：按制作形态与业务主题生成口播或跟拍大纲，支持已有稿保留、再生成新记录、全文复制。
- 新建脚本必选「已拍摄 / 未拍摄」：已拍摄产出素材描述 + 剪辑建议；未拍摄产出拍摄分镜 + 剪辑建议；全文末尾含「拍摄与剪辑指导」。
- DashScope 不可用或返回无效 JSON 时降级为本地模板，并在详情标为 `mock（已降级）`，避免静默伪造成功。
- 参考片仅使用当前 owner 的导入视频；`internalNote` 不进入可复制全文。

## 脚本工作台

入口：`http://localhost:3000/scripts`。

- 创建：`/scripts/new`，选择形态、主题、拍摄状态后生成。
- 详情：结构化预览 + 可编辑全文；手工改全文后上方结构化区块可能不同步，复制以全文为准。
- 再生成：保留原记录，新建一条。
- Provider：配置 `DASHSCOPE_API_KEY`（或兼容的 `LLM_API_KEY` / `VISION_API_KEY`）时走 DashScope；否则用确定性 mock。

Sites / D1 云端路径支持脚本草稿持久化；PostgreSQL（`APP_MODE=REAL`）当前**不**支持脚本工作台，请继续用 LOCAL 或 Sites 部署。

### 仅上线脚本工作台（Zeabur / 单服务）

如果你只想上线 `/scripts`，建议只部署 `apps/web`，不部署 `worker`、不接 PostgreSQL。

关键是把仓储切到本地 JSON：

- `REPOSITORY_BACKEND=local`
- `APP_MODE=LOCAL`
- `NEXT_PUBLIC_APP_MODE=LOCAL`
- `DASHSCOPE_API_KEY=<你的key>`（可选，不填则走 mock）

可选（自定义本地只读源路径，不配也可启动）：

- `LOCAL_SOURCE_WORKBOOK=/app/outputs/xxx.xlsx`
- `LOCAL_VIDEO_DIRECTORY=/app/videoes`

说明：

- `REPOSITORY_BACKEND=local` 会把 API 的读写切到 `.data/local-state.json`，适合单机轻量部署。
- 脚本工作台本身不依赖 Worker；视频诊断/转写链路仍属于完整部署范畴。
- `.data` 必须挂持久卷，否则容器重建会丢脚本草稿。

## 运行模式

### LOCAL（默认，本地存储）

不依赖 PostgreSQL。配置工作簿和视频目录后，数据事实来自用户提供的工作簿，播放器读取本地视频；点击分析后运行本地规则诊断，页面明确标记“本地规则诊断”。AI 脚本等功能的 Provider 单独配置。

```powershell
npm.cmd install
npm.cmd run dev
```

打开 `http://localhost:3000`。首次体验脚本工作台不需要创建 `.env`；根目录 `.env.example` 可作为环境变量清单参考。

如需换目录，可在环境变量中覆盖：

```powershell
$env:LOCAL_SOURCE_WORKBOOK = "D:\path\matched.xlsx"
$env:LOCAL_VIDEO_DIRECTORY = "D:\path\videos"
npm.cmd run dev
```

### REAL

REAL 模式使用 PostgreSQL 队列与独立 Worker。先准备 PostgreSQL 并执行：

```powershell
psql $env:DATABASE_URL -f packages/database/migrations/0001_initial.sql
$env:APP_MODE = "REAL"
$env:NEXT_PUBLIC_APP_MODE = "REAL"
npm.cmd run dev
```

另开终端启动 Worker：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r apps/worker/requirements.txt
Push-Location apps/worker
..\..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
Pop-Location
```

Worker 健康检查：`http://127.0.0.1:8000/health`。

REAL 模式下 Web 与 Worker 共享 PostgreSQL `analysis_jobs` 队列；Web 使用 Drizzle Schema/事务写入导入数据，Worker 使用 `FOR UPDATE SKIP LOCKED` 安全领取任务。生产部署仍需接入 Supabase Auth，并把本地私有存储适配为 Supabase Storage；不要把 LOCAL 状态库当成多用户生产数据库。

## Docker Compose

```powershell
Copy-Item .env.example .env
docker compose up --build
```

包含 Web、Worker、PostgreSQL 16。Dockerfile 会安装 Worker 所需 FFmpeg。生产环境必须替换 `SIGNED_URL_SECRET`，并通过 Secret 管理提供 AI 密钥。

## 环境变量

完整列表见 `.env.example`。重要变量：

- `APP_MODE` / `NEXT_PUBLIC_APP_MODE`：`LOCAL` 或 `REAL`。
- `LOCAL_SOURCE_WORKBOOK`：LOCAL 模式读取的已匹配工作簿。
- `LOCAL_VIDEO_DIRECTORY`：LOCAL 模式直接读取的视频目录。
- `DATABASE_URL`：PostgreSQL 连接串。
- `PRIVATE_STORAGE_ROOT`：私有视频目录，不应挂到公开静态目录。
- `SIGNED_URL_SECRET`：签名地址密钥。
- `SPEECH_*`、`VISION_*`、`LLM_*`、`DASHSCOPE_*`：Provider 地址、模型与密钥（脚本工作台可复用 DashScope 兼容密钥）。
- `MAX_VIDEO_FILE_MB`、`MAX_VIDEO_FILES`：上传限制。

日志不得记录这些密钥。系统不处理微信 Cookie，不实现登录、发布、评论、私信或关注。

## 验证

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
python -m pytest apps/worker/tests
```

自动化测试覆盖日期、百分比、空值、视频 ID 去重、标题清洗、匹配阈值、歧义匹配、发布时间排序、零播放互动率、AI Schema、脚本工作台 productionGuide 归一化与无留存约束。

## 请勿提交本地数据

以下目录/文件已在 `.gitignore` 中忽略，**不要**手动 `git add -f` 推上仓库：

- `.data/`（含 `local-state.json`、上传与备份）
- `videoes/`、`*.xlsx`、`outputs/*`
- `.env` 与各类密钥

源工作簿与视频请留在本机只读路径；分析状态仅写入本地 `.data`。

## 真实限制

- 第一版没有视频号逐秒留存采集，不能声称定位真实流失秒数。
- LOCAL 模式只运行可解释规则诊断，不会虚构人物、产品、字幕或逐字转写。
- Worker 的 Speech/Vision Provider 只有在 REAL 模式并配置兼容 API 后才提供真实转写与视觉理解。
- 镜头切分优化、OCR、人工口播修订和反馈学习属于 P1。
- `retention_datasets` 与 `retention_points` 仅完成数据库预留。
- 未实现微信自动化、扩展采集或自动发布。

## 文档与反馈

- [使用说明](README-使用说明.md)：Windows / Mac 启动步骤与常见问题。
- [技术方案](docs/TECHNICAL_PLAN.md)：架构、数据流与部署限制。
- [热点数据源与 RSSHub](docs/HOTSPOT_SOURCES.md)：研究来源、抓取与刷新配置。
- [GitHub Issues](https://github.com/SherlockMF/wechat-channels-ai-assistant/issues)：提交问题时请附系统版本、复现步骤和脱敏后的错误信息。
