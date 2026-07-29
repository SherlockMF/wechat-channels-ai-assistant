# 视频号内容诊断助手

一个可运行的桌面端优先 MVP：默认直接读取已匹配的视频号数据工作簿与本地视频目录，按发布时间选择近期视频，运行规则/媒体/AI 诊断，并输出可编辑 Markdown 报告。上传新批次仍作为可选入口保留。

## 默认真实数据源

本地启动默认读取以下两个用户指定目录，不生成演示数据，也不复制源视频：

- 工作簿：`outputs/019fab89-e492-7a70-88d3-a82ff1206eed/视频号动态数据明细_已匹配视频名称.xlsx`
- 视频目录：`videoes`

当前工作簿包含 81 条有效记录，其中 80 条已填写真实视频文件名；`videoes` 包含 89 个视频。源工作簿和视频保持只读，分析任务与报告编辑稿单独保存到 `.data/local-state.json`。工作簿或视频目录发生变化后，重启应用会按文件大小和修改时间重新同步，同时尽量保留仍可关联的分析结果。

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

## 运行模式

### LOCAL（默认，真实本地数据）

不依赖 PostgreSQL 或 AI 密钥。数据事实直接来自上述真实工作簿，播放器直接读取 `videoes` 中的真实视频；点击分析后运行本地规则诊断，页面明确标记“本地规则诊断”，不会冒充 AI 内容理解。

```powershell
npm.cmd install
npm.cmd run dev
```

打开 `http://localhost:3000`。LOCAL 模式已有代码内默认路径，不需要先创建 `.env`；根目录 `.env.example` 主要供 Docker Compose 和环境变量清单参考。

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
- `SPEECH_*`、`VISION_*`、`LLM_*`：Provider 地址、模型与密钥。
- `MAX_VIDEO_FILE_MB`、`MAX_VIDEO_FILES`：上传限制。

日志不得记录这些密钥。系统不处理微信 Cookie，不实现登录、发布、评论、私信或关注。

## 验证

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
python -m pytest apps/worker/tests
```

自动化测试覆盖日期、百分比、空值、视频 ID 去重、标题清洗、匹配阈值、歧义匹配、发布时间排序、零播放互动率、AI Schema 与无留存约束。

## 真实限制

- 第一版没有视频号逐秒留存采集，不能声称定位真实流失秒数。
- LOCAL 模式只运行可解释规则诊断，不会虚构人物、产品、字幕或逐字转写。
- Worker 的 Speech/Vision Provider 只有在 REAL 模式并配置兼容 API 后才提供真实转写与视觉理解。
- 镜头切分优化、OCR、人工口播修订和反馈学习属于 P1。
- `retention_datasets` 与 `retention_points` 仅完成数据库预留。
- 未实现微信自动化、扩展采集或自动发布。

更详细的架构、风险和数据流见 [技术方案](docs/TECHNICAL_PLAN.md)。
