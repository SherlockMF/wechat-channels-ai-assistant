# RSSHub 一键启动设计

## 目标

Windows 用户双击现有启动脚本即可使用工作台。首次运行时若缺少 Docker Desktop，脚本自动发起安装；以后只检查并启动 Docker 与 RSSHub，不重复安装。RSSHub 启动失败时，工作台仍正常启动并继续使用普通 RSS 源。

## 启动流程

1. 检查并安装现有 Node.js、FFmpeg 与 npm 依赖。
2. 调用独立 PowerShell 脚本检查 Docker CLI 与 Docker Engine。
3. Docker Desktop 缺失时通过 `winget` 安装；已安装但未运行时启动 Docker Desktop 并等待 Engine 可用。
4. 使用 `docker-compose.rsshub.yml` 启动 RSSHub、Redis 和浏览器服务，并等待 `/healthz` 成功。
5. RSSHub 健康时向 Web 进程注入 `HOTSPOT_RSSHUB_BASE_URL=http://127.0.0.1:1200`；用户在设置中手工填写的地址优先。
6. 自动选择可用 Web 端口，打开与实际启动端口一致的浏览器地址。

## 失败处理

- Docker 首次安装需要 UAC、首次许可确认或系统重启时，清楚提示用户，当前工作台仍继续启动。
- Docker 或 RSSHub 超时后返回非零状态，但不阻断 Web。
- RSSHub 地址仅在健康检查通过后注入，避免把不可用服务标记为已配置。
- 提供单独的安装/修复入口与停止 RSSHub 入口。

## 兼容性与安全

- 不读取、打印或改写用户密钥。
- 不结束占用端口的其他进程；Web 从 `3000` 起选择空闲端口。
- Docker Desktop 只在缺失时安装；容器镜像只在首次不存在或显式更新时下载。
- 使用当前 RSSHub 官方 Compose 变量 `PLAYWRIGHT_WS_ENDPOINT`。
