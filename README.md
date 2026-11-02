# WeChat Channels AI Assistant · 微信视频号 AI 创作助手

面向微信视频号创作者的本地优先工作台，整合 **AI 脚本生成、发布前审片、视频数据分析、热点选题与爆款研究**，帮助创作者从选题、拍摄到复盘形成完整工作流程。

A local-first AI assistant for WeChat Channels creators: script writing, pre-publish video review, Excel analytics, trending topics, and viral content research.

## 核心功能

| 功能 | 主要能力 |
| --- | --- |
| 脚本工作台 | 生成口播稿、跟拍大纲、拍摄分镜与剪辑建议，支持编辑、复制和再生成 |
| 发布前审片 | 分析待发布视频，提供修改建议、版本对比和封面建议 |
| 数据导入与匹配 | 解析视频号 Excel 数据，按视频 ID、标题与相似度匹配视频，支持人工确认 |
| 视频数据分析 | 计算账号基线、互动率与近期表现，生成可编辑的 Markdown 诊断报告 |
| 热点与爆款研究 | 汇集 RSS、RSSHub 与联网检索结果，结合内容方向筛选选题和参考内容 |

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
- **AI 与研究**：DashScope / Qwen、可替换的语音与视觉 Provider、RSS / RSSHub。

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
