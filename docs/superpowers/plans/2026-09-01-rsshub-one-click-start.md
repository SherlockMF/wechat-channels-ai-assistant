# RSSHub 一键启动实施计划

1. 新增 Windows PowerShell 启动器，完成 Docker 发现、按需安装、Engine 等待、Compose 启动和健康检查。
2. 修正 RSSHub Compose 的浏览器连接变量，新增安装/修复与停止入口。
3. 修改两个 Windows 启动脚本：RSSHub 成功后注入本地地址，并自动选择空闲 Web 端口。
4. 在服务端热点配置中增加环境变量回退，保持设置页手工配置优先。
5. 补充自动化测试，实际安装 Docker Desktop、启动 RSSHub，并验证健康接口和工作台集成。
