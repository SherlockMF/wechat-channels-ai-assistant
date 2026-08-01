# 审片封面方案（生图提示词）设计

## 目标

在发布前审片详情页，根据用户上传的背景图 + 文字描述，结合审片上下文，生成可交给 GPT/即梦等的生图提示词、封面标题备选与排版说明；每次生成保留历史。

## 已确认决策

| 项 | 选择 |
|----|------|
| 范围 | 仅发布前审片（不含脚本工作台） |
| 触发 | 详情页按需生成 |
| 背景图 | 用户每次临时上传 |
| 输出 | 生图提示词 + 标题备选 + 排版说明 |
| 模型输入 | 多模态读图 + 用户描述 + 审片标题/标签/诊断摘要 |
| 持久化 | 每次一条历史记录 |
| 方案 | 详情内嵌面板 |

## 数据模型

`DraftCoverBrief`：`id`、`draftReviewId`、`versionId?`、`backgroundPath`、`backgroundMimeType`、`userDescription`、`imagePrompt`、`titles[]`、`layoutNotes`、`provider`、`status`（`processing`/`completed`/`failed`）、`errorMessage?`、`createdAt`。

存储：`.data/draft-reviews/{owner}/{draftId}/cover-briefs/{briefId}/`；LOCAL `draftCoverBriefs[]`。

不修改视频 `coverPath`。

## API

- `POST /api/draft-reviews/[id]/cover-briefs` — multipart background + description
- `GET /api/draft-reviews/[id]/cover-briefs` — 历史列表
- `GET .../cover-briefs/[briefId]` — 详情
- `GET .../cover-briefs/[briefId]/background` — 背景图

Provider：`CoverBriefProvider`（DashScope 多模态 / Mock）。

## UI

详情页「生成封面方案」：上传图 + 描述 → 结果三段可复制 + 历史列表。

## 范围外

脚本工作台、真出图 API、自动替换视频封面、截帧当背景。
