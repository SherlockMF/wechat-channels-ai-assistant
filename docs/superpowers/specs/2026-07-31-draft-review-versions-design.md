# 发布前审片 · 多版本上传设计

## 目标

在同一条审片会话内支持多次上传新版视频，便于对照修改效果，并在新版完整诊断上叠加相对上一版的改版对照（已改善 / 仍存在 / 新问题）。

## 已确认决策

| 项 | 选择 |
|----|------|
| 组织方式 | 同一条审片下叠版本（非独立新审片、非覆盖式） |
| 分析 | 新版完整重出 + 相对上一版对照 |
| 详情布局 | 单栏 + 顶部版本切换；对照摘要叠在报告上方 |
| 元数据 | 新版默认沿用标题/标签/目标，可改 |
| 数据方案 | 审片会话 + `DraftReviewVersion` 子实体 |

## 用户流程

1. `/review/new` 上传 → 创建会话 + v1 → 分析 → `/review/[id]`
2. 详情页「上传新版本」→ 预填元数据 → 提交视频 → vN 分析 + changelog
3. 顶部 chip 切换 v1…vN，查看对应视频与报告；非 v1 显示改版对照

## 数据模型

### DraftReview（会话）

保留 `id`、`ownerId`、`title`、`goal`、`tags`、`baselineImportId`、`currentVersionId`、列表摘要所需字段（可由当前版本派生或冗余缓存：`status`、`coverPath`、`updatedAt` 等）。

视频文件、证据、逐版本进度挂在 Version 上。

### DraftReviewVersion

- `id`、`draftReviewId`、`versionNumber`（从 1 递增）
- 文件：`originalFilename`、`storagePath`、`mimeType`、`fileSize`、时长/分辨率/fps
- 封面：`coverPath`、`coverSource`、`coverFrameSecond`
- `evidencePath`
- `status` / `progress` / `currentStep` / `errorMessage`
- `createdAt` / `completedAt`

上限：**每会话最多 5 个版本**。

### DraftReviewResult

- 挂 `draftReviewVersionId`（一对一）
- `result: DiagnosisResult`、`editedMarkdown`、`provider`
- 可选 `changelog`：`{ improved[], remaining[], newIssues[] }`，项含 `category`、短说明；相对**上一版本号**的结果做规则匹配（category + 时间窗近似），第一版不强制二次 LLM

### 存储

`.data/draft-reviews/{ownerId}/{draftReviewId}/v{n}/`（视频、evidence、cover）。

LOCAL：`.data/local-state.json` 增加 `draftReviewVersions`（或等价结构）；结果按 versionId 索引。

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/draft-reviews` | 会话 + v1（兼容现行为） |
| POST | `/api/draft-reviews/[id]/versions` | 新版本；409 分析中；422 满 5 版 |
| GET | `/api/draft-reviews/[id]?version=` | 默认当前版；含 `versions[]` 摘要 |
| POST | `/api/draft-reviews/[id]/reanalyze` | 重跑指定/当前版本，重算 changelog |
| DELETE | `/api/draft-reviews/[id]/versions/[versionId]` | 不可删唯一版本；删当前则回退最新剩余 |
| GET/POST | video / cover / cover-from-frame | 按当前或指定 version |

新版本请求：multipart 视频必填；封面可选；标题/标签/目标可选（缺省沿用会话）。

## UI

- 列表：一行一条会话；展示当前版状态/封面；`共 N 版`
- 详情：版本 chip、`上传新版本` 弹层、changelog 块、按查看版本编辑/导出报告
- 深链：`?v=` 可选

## 错误与边界

- 分析中禁止再传（409）
- 满 5 版（422）
- 某版 failed 可 reanalyze；可切看其它成功版
- 无上一版结果 → 无对照块
- 删审片清理整棵目录

## 范围外

左右并排双播、二次 LLM 长文对照、跨审片合并版本。

## 测试

- changelog 匹配规则；版本递增；满 5 拒绝；删当前回退
- LOCAL 多版本并存与删除清理
- API 409/422；GET `?version=`
- 手工：预填元数据、chip 切换、对照块显隐
