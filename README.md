# WeChat Channels AI Assistant · 微信视频号 AI 创作助手

面向微信视频号创作者的本地优先工作台，整合 **AI 脚本生成、发布前审片、视频数据分析、热点选题与爆款研究**，帮助创作者从选题、拍摄到复盘形成完整工作流程。

A local-first AI assistant for WeChat Channels creators: script writing, pre-publish video review, Excel analytics, trending topics, and viral content research.

## 快速启动（本地使用）

日常使用只需启动 Web 应用。脚本、创作资料、提词器和热点抓取不需要 Docker、RSSHub 或 PostgreSQL，也不需要先准备 Excel 和视频。

### 1. 准备环境

- Node.js 22.12 或更新的 22.x 版本，以及随附的 npm。仓库使用的 Vite 要求 Node.js `^20.19.0 || >=22.12.0`。
- Git，用于下载和更新仓库。
- 使用视频审片、截帧等媒体功能时，另行安装 FFmpeg，并将 `ffmpeg`、`ffprobe` 加入 PATH。

```sh
node --version
npm --version
git clone https://github.com/SherlockMF/wechat-channels-ai-assistant.git
cd wechat-channels-ai-assistant
npm ci
```

### 2. 创建本地配置

在仓库根目录执行。已有 `.env` 时保留原配置，不要覆盖。

Windows PowerShell：

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

macOS / Linux：

```sh
test -f .env || cp .env.example .env
```

模板默认使用本地模式：

```dotenv
APP_MODE=LOCAL
NEXT_PUBLIC_APP_MODE=LOCAL
REPOSITORY_BACKEND=local
```

首次配置时，将 `SIGNED_URL_SECRET` 的示例值替换为自己的长随机字符串。`LOCAL_SOURCE_WORKBOOK` 和 `LOCAL_VIDEO_DIRECTORY` 可以留空；需要数据分析时再填入自己的工作簿、视频目录。不要将真实密钥或个人素材提交到仓库。

### 3. 启动并打开页面

在仓库根目录运行：

```sh
npm run dev
```

打开终端输出的 `Local` 地址，通常是 **http://localhost:3000/scripts**。端口被占用时可能自动使用 3001 等其他端口，以实际输出为准。也可以指定端口：

```sh
npm run dev --workspace @video-diagnosis/web -- --port 3001
```

对应地址：**http://localhost:3001/scripts**。保持终端运行；停止服务按 `Ctrl+C`。下次启动只需进入仓库目录再次执行启动命令，不需要重复安装依赖。

### 4. 配置 AI 和账号资料

进入顶部「设置」：

1. 在「账号画像」填写账号定位、受众、语气和内容方向。
2. 在「API 配置」填写自己的百炼 API Key，选择该 Key 有权限调用的语言、视觉和语音模型，保存。
3. 在「环境检测」查看 FFmpeg、Provider 等状态。修改 `.env` 后重启 Web 服务。

热点原始榜单和本地基础演讲提示不依赖模型。AI 脚本、局部改稿、学习语气、热点选题建议和联网研究需要可用的模型权限；视觉与转写还需要对应模型。页面显示 `mock` / `mock（已降级）` 时，表示当前结果是模板或降级结果。

## 常用入口

| 页面 | 地址路径 |
| --- | --- |
| 脚本工作台 | `/scripts` |
| 新建脚本 | `/scripts/new` |
| 创作资料：语气、素材、栏目、选题池 | `/creator-studio` |
| 热点与选题 | `/hotspots` |
| 发布前审片 | `/review` |
| 数据导入 | `/imports/new` |
| 数据分析 | `/analysis` |
| 账号与 API 设置 | `/settings` |

脚本详情顶部的「口播语气／演讲提示」可查看逐句提示；「提词排练」打开提词器。旧稿自动补齐基础提示，手改后点击「按当前口播更新提示」。

## 构建和检查

以下命令在仓库根目录运行：

```sh
npm test
npm run typecheck
npm run build
```

默认 `build` 使用面向 Sites 的 vinext 配置，数据访问依赖云端 D1 / R2 绑定。虽然构建会输出 `apps/web/dist/standalone`，直接用 Node 启动它并不等于完整的本地应用，脚本接口会因缺少 `DB` 绑定而失败。

本地生产构建使用 Next.js，两条命令需成对执行：

```sh
npm run build:next --workspace @video-diagnosis/web
npm run start --workspace @video-diagnosis/web
```

`next start` 使用 `.next` 产物，不能用于启动默认 vinext 的 `dist` 产物。

生产环境需要单独提供环境配置。不要把本机 `.env` 或 `.data` 打包到公开部署产物中；日常本地使用优先采用上面的 `npm run dev`。

## 可选：Python Worker

Python Worker 面向 PostgreSQL 后台分析队列，不是本地脚本、热点和提词器的启动前置条件。需单独运行时，准备 Python 3.11 与 FFmpeg，在仓库根目录新开终端：

```sh
python -m venv .venv
```

Windows PowerShell（无需激活虚拟环境）：

```powershell
.\.venv\Scripts\python.exe -m pip install -r apps/worker/requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir apps/worker --host 127.0.0.1 --port 8000
```

macOS / Linux：

```sh
.venv/bin/python -m pip install -r apps/worker/requirements.txt
.venv/bin/python -m uvicorn app.main:app --app-dir apps/worker --host 127.0.0.1 --port 8000
```

健康检查：http://127.0.0.1:8000/health。`APP_MODE=LOCAL` 不轮询数据库队列；使用 `REAL` 队列模式还需要配置 PostgreSQL、执行数据库初始化，并让 Web 与 Worker 使用相同的存储位置和数据库配置。

仓库保留的 Docker Compose 是高级部署参考。当前 Web Dockerfile 仍按 Next.js `.next/standalone` 复制产物，与默认 vinext 构建不匹配，使用前需统一构建方式；不要把 `docker compose up` 作为本地快速启动步骤。默认热点已移除 RSSHub Compose。

## 数据保存与常见问题

本地草稿、创作资料、设置及上传文件保存在 `.data` 目录中；使用 npm workspace 启动时通常位于 `apps/web/.data`，自定义环境变量可改变位置。更新代码前备份实际数据目录和 `.env`，不要为排障删除它们。

| 问题 | 处理方式 |
| --- | --- |
| 打开的不是这个项目 | 查看终端的 `Local` 地址；其他项目可能占用了 3000，指定 3001 启动后访问对应地址 |
| `node` / `npm` 找不到或版本不兼容 | 安装符合上述版本要求的 Node.js，重新打开终端，再检查版本 |
| 首次安装失败或提示缺包 | 在仓库根目录运行 `npm ci`，检查 npm 网络连接，不要只在子目录单独安装 |
| `Model access denied` 或无调用权限 | 确认 API Key 对应的服务地域、模型授权与额度；换用已开通的模型后保存设置 |
| 页面显示模板或降级稿 | 检查 API 配置及实际错误；这不表示已完成真实 AI 分析 |
| 视频审片提示缺少 FFmpeg | 确认 `ffmpeg -version` 和 `ffprobe -version` 可运行，再重启 Web 服务 |
| Worker 不可达 | 本地脚本流程无需 Worker；使用后台队列时检查 8000 端口、`WORKER_URL` 和 Worker 终端错误 |
| 旧稿没有语气提示 | 刷新脚本详情，点顶部「口播语气／演讲提示」；修改正文后点击「按当前口播更新提示」 |
| 个别热点源失败 | 查看该源具体错误；其他源仍会返回结果，恢复网络后重试。默认九源无需启动 Docker |

## 核心功能

| 功能 | 主要能力 |
| --- | --- |
| 脚本工作台 | 生成口播稿、跟拍大纲、拍摄分镜与剪辑建议，支持局部改稿、自动保存、提词器和版本对比 |
| 创作资料 | 管理确认过的语气样本、真实素材、固定栏目及选题排期；生成时保留账号与资料快照 |
| 发布前审片 | 分析待发布视频，提供修改建议、版本对比和封面建议 |
| 数据导入与匹配 | 解析视频号 Excel 数据，按视频 ID、标题与相似度匹配视频，支持人工确认 |
| 视频数据分析 | 计算账号基线、互动率与近期表现，生成可编辑的 Markdown 诊断报告 |
| 热点与爆款研究 | 直连六个平台榜单并汇集三个 RSS 来源，结合内容方向筛选选题、收藏到选题池 |

## 工作流程

1. **研究选题**：查看近期热点和参考内容，选择适合账号的创作方向。
2. **生成脚本**：选择内容形态、主题与拍摄状态，生成脚本和制作指导。
3. **发布前审片**：上传待发布视频，根据报告调整内容，并对比不同版本。
4. **导入表现数据**：导入视频号工作簿，确认数据记录与视频素材的对应关系。
5. **分析与复盘**：选择近期视频，结合账号基线查看问题、证据和改进动作。

## 输入与输出

- **输入**：创作主题、拍摄状态、视频号 Excel 工作簿、视频素材，以及可选的参考内容。
- **输出**：脚本草稿、拍摄与剪辑指导、审片报告、封面建议、热点选题和数据诊断报告。
- **数据保存**：源工作簿和视频保持只读；草稿、分析结果与报告编辑稿单独保存。
- **内容编辑**：报告支持编辑、保存、复制与 Markdown 导出；脚本再生成会保留原记录。

脚本工作台不依赖 Excel 或样例视频。数据诊断需要用户提供真实工作簿与视频；真实 AI 生成、转写及视觉分析需要相应 Provider。未配置 AI 或生成失败时，支持降级的功能会明确标记 mock 或本地规则结果。

## 技术组成

- **应用界面**：Next.js、React、TypeScript、Tailwind CSS。
- **数据处理**：XLSX、Zod、Drizzle ORM、PostgreSQL。
- **媒体分析**：FastAPI、Pydantic、FFmpeg / ffprobe。
- **AI 与研究**：DashScope / Qwen、可替换的语音与视觉 Provider、平台榜单适配与 RSS；默认热点不需要 Docker 或 RSSHub。

## 功能边界

- 诊断区分数据事实、合理推断与执行建议。
- 不采集视频号逐秒留存，不能据此定位真实流失秒数。
- 本地规则诊断不等同于 AI 视频理解，不生成未经识别的字幕或转写。
- 不处理微信 Cookie，不提供微信登录、自动发布、评论、私信或关注功能。
- 项目不包含个人视频、业务工作簿或 API 密钥；本项目非微信或腾讯官方产品。

## 项目文档

- [功能使用说明](README-使用说明.md)：各模块的操作流程与结果解读。
- [技术方案](docs/TECHNICAL_PLAN.md)：核心模块、数据流与数据约束。
- [热点数据源](docs/HOTSPOT_SOURCES.md)：来源类型、筛选机制和结果边界。
- [GitHub Issues](https://github.com/SherlockMF/wechat-channels-ai-assistant/issues)：反馈问题与功能建议。
