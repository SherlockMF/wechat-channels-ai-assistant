# 发布前审片功能设计

## 目标

新增独立入口「发布前审片」，支持上传刚剪好的单条视频（标题、发布目标选填），提取媒体证据后通过可替换 LLM Provider 生成与 Codex 结构一致的修改建议，并叠加账号基线对照。

## 用户流程

`/review` → `/review/new` 上传 → 后台证据提取 + Provider 诊断 → `/review/[id]` 查看报告、编辑、导出 Markdown。

## 数据模型

- `draft_reviews`：审片实体（视频元信息、状态、证据路径）
- `draft_review_results`：结构化 `DiagnosisResult` + 可选 `editedMarkdown`

LOCAL 模式写入 `.data/local-state.json`；视频存 `.data/draft-reviews/{ownerId}/`。

## 分析管线

1. ffprobe + 关键帧证据包（对齐 `prepare-codex-analysis.mjs`）
2. 按视频标签检索历史相似视频（标题命中 + 相似度），附带完播/观看/播放
3. `DraftReviewProvider.analyze()` → `DiagnosisResult`（含文案/字幕合理性与专业性、标题建议）
4. 账号基线取自最近导入的 Excel records

第一版 Provider：`MockDraftReviewProvider`（默认）、`DashScopeDraftReviewProvider`（百炼）、`HttpDraftReviewProvider`（环境变量配置）。

## 约束

- 单条上传；选填标题、标签、发布目标、封面
- 不声称逐秒留存
- 无基线时仅内容侧建议；无标签时标题建议仍可生成但相似历史对照较弱
- 文案/字幕专业性评估需人工终审
