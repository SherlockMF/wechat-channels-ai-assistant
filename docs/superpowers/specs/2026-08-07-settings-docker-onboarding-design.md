# 设置中心与 Docker 交付环境引导

## 目标

为打包给非技术对方使用的本地完整运行场景，提供：

1. **包外启动器**（Windows / macOS）：检测并引导安装 Docker Desktop，拉起 compose，打开应用。
2. **应用内设置中心**：环境健康检查、Provider API 配置、首次使用向导。

确保对方在本机跑通全部功能（含 Worker、FFmpeg 相关审片/截帧等），且无需在宿主机单独安装 Node / FFmpeg。

## 已确认决策

| 决策 | 选择 |
|------|------|
| 目标平台 | Windows + macOS（不含 iPhone/iPad） |
| 运行方式 | 对方本机完整本地跑（不依赖我方服务器） |
| 分发形态 | Docker Desktop 一键（方案 2） |
| 缺 Docker 时 | 打开官方下载页 + 简明步骤（**不**内置安装包） |
| 设置入口 | AppShell 顶栏齿轮 |
| 设置布局 | 首次步进向导；完成后 Tab（环境检测 / API 配置 / 首次指引） |
| API 持久化 | 挂载卷上的 `user-settings.json`；Provider 优先读该文件，再回退环境变量 |
| 宿主机依赖安装 | 不做（Node/FFmpeg 仅在容器内） |
| 桌面壳 | 不做 Electron/Tauri |

## 架构

```
[启动.bat / 启动.command]
        │
        ├─ Docker 未安装 → 打开官方下载页 + 说明
        ├─ Docker 未运行 → 尝试拉起 Desktop，轮询 docker info
        └─ docker compose up -d --build → 打开 http://localhost:3000
                    │
                    ▼
            [Web + Worker + Postgres]
                    │
                    ▼
            [设置中心] ←── user-settings.json（volume）
              ├ 健康检查 API
              ├ Provider 配置 API
              └ 首次向导状态
```

职责边界：

- **启动器**：解决「没有 Docker / 服务未起 → 进不了设置页」的鸡生蛋问题。
- **Docker 镜像**：内含 Node、Python Worker、FFmpeg；对方本机不必装这些。
- **设置页**：检测与配置；**不**在宿主机安装软件。

## 交付物

对方 zip 至少包含：

| 文件 | 作用 |
|------|------|
| `启动.bat` | Windows 启动器 |
| `启动.command` | macOS 启动器（可双击） |
| `停止.bat` / `停止.command` | 停止 compose |
| `docker-compose.yml` | 现有栈（web / worker / postgres），按需扩展 env 与 settings volume |
| `README-使用说明.md` | Docker 下载链接、首次步骤、常见问题 |
| 源码构建上下文 | `apps/`、`packages/` 等（供 `compose build`） |

### 启动器行为（Win / Mac 对称）

1. 检测 `docker` 是否在 PATH。
2. 未安装 → 打开 Docker Desktop 官方下载页；终端/提示写出约 3 步说明（安装 → 打开 Docker → 再双击本脚本）。
3. 已安装未运行 → 尝试启动 Docker Desktop；轮询 `docker info` 直至成功或超时（超时则提示手动打开）。
4. 在项目根执行 `docker compose up -d --build`（首次构建可能较慢，需提示等待）。
5. 等待 Web 可访问后打开 `http://localhost:3000`。

## 应用内设置

### 入口与导航

- `AppShell` 顶栏右侧增加设置按钮（齿轮），进入 `/settings`。
- **首次**：若 `setupCompleted !== true` 且未 `dismissWizard`，进入步进向导（可跳过，业务页顶部保留提醒条）。
- **之后**：设置页三个 Tab——环境检测 / API 配置 / 首次指引（可重新打开检查清单）。

### Tab ① 环境检测

`GET /api/settings/health` 返回各项状态，例如：

| 检查项 | 通过条件 |
|--------|----------|
| Postgres | 可连接 |
| Web | 自身存活（隐含） |
| Worker | HTTP 探活成功 |
| FFmpeg / ffprobe | 容器内 `ffmpeg -version` / `ffprobe -version` 成功 |
| 存储 | `PRIVATE_STORAGE_ROOT` 可写 |

UI：每项就绪 / 失败；失败给出**可操作**修复文案（如「请确认已运行启动脚本」「FFmpeg 异常请重新 build 镜像」），明确不是让用户在 Windows 上装 Node。

### Tab ② API 配置

可配置项（与现有 `.env.example` 对齐，UI 可合并「同一 DashScope Key」快捷填入）：

- `DASHSCOPE_API_KEY`（及可选 base URL）
- `SPEECH_*` / `VISION_*` / `LLM_*`（provider、base URL、key、model）

行为：

- `GET/PUT /api/settings/providers`
- 读写 volume 上的 `user-settings.json`
- 返回时 Key **脱敏**（仅末 4 位）
- 可选「测试连接」：失败标红，**不阻断保存**
- Web / Worker 侧 Provider：**优先读 user-settings**，再回退进程环境变量

### Tab ③ 首次指引

检查清单：

1. Docker 已运行（由健康检查间接体现）
2. 服务健康（health 全绿）
3. API 已配置
4. 建议试用：脚本工作台 / 审片（链到对应页面）

支持「标记完成」与「不再显示」；状态写入同一 `user-settings.json`。

## 数据模型

`user-settings.json`（示意）：

```json
{
  "setupCompleted": false,
  "dismissWizard": false,
  "providers": {
    "dashscopeApiKey": "",
    "dashscopeApiBaseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "speech": { "provider": "mock", "apiKey": "", "apiBaseUrl": "", "model": "" },
    "vision": { "provider": "dashscope", "apiKey": "", "apiBaseUrl": "", "model": "" },
    "llm": { "provider": "dashscope", "apiKey": "", "apiBaseUrl": "", "model": "" }
  }
}
```

- 文件位于 compose **共享挂载卷**（web 与 worker 只读/读写同一路径；写入仅通过 Web 的 settings API）。
- Worker 启动后与每次任务前读取该文件；不另做 HTTP 同步。
- Web 镜像须包含 `ffmpeg`/`ffprobe`（审片证据与截帧在 Web 进程内调用）；若当前 Dockerfile 缺失，实现时补上。

## 错误处理

| 场景 | 处理 |
|------|------|
| Docker 未安装 | 启动器打开官方下载页 + 说明 |
| Docker 未运行 / 超时 | 提示手动打开 Docker Desktop 后重试 |
| Worker 不通 | 设置页提示检查 compose 是否在跑 |
| 容器内 FFmpeg 失败 | 提示 `compose build` 重建，非宿主机安装 |
| API Key 无效 | 测试失败标红；仍允许保存 |
| 未完成首次向导 | 可跳过；业务页顶部提醒条 |

## 本版明确不做

- 不内置 Docker Desktop 安装包
- 不在宿主机一键安装 Node / FFmpeg / Python
- 不做 Electron / Tauri 桌面壳
- 不做 iOS / iPad 支持
- 不做「无 Docker 的纯本机依赖脚本」作为主路径（若后续需要可作为独立增强）

## 验收标准

1. 未装 Docker 的 Windows / macOS：双击启动器 → 看到下载引导，而不是静默失败。
2. 已装 Docker：双击启动器 → compose 拉起 → 浏览器打开应用。
3. 首次进入出现向导；可完成或跳过。
4. 设置页可看到健康检查结果；FFmpeg/Worker 异常时有明确修复指引。
5. 在设置页保存 API Key 后，脚本/审片等依赖 Provider 的功能能读到新配置（无需手改 `.env`）。
6. 对方本机无需安装 Node 或 FFmpeg 即可使用依赖媒体处理的功能（在 Docker 路径下）。
