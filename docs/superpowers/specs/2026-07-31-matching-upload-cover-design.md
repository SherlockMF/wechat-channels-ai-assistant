# 数据匹配上传与视频封面设计

## 目标

1. 数据匹配页用 Tab 并存：**本地数据源** | **上传新批次**
2. 上传新批次：Excel → 视频 + 同名封面 → 自动匹配
3. 发布前审片与匹配视频均支持封面；无封面时自动截约 1s 帧，并可改选其他帧

## 封面规则

- 批量上传：封面与视频 basename 相同（忽略扩展名），如 `宣传片.mp4` ↔ `宣传片.jpg`
- 支持封面格式：jpg / jpeg / png / webp
- 无配对封面：ffmpeg 截取 `min(1.0, duration-0.05)` 秒帧
- 用户可调用 `cover-from-frame` 改选任意秒数覆盖封面

## 数据字段

`VideoAsset` / `DraftReview` 增加：

- `coverPath: string | null`
- `coverSource: "uploaded" | "frame" | null`
- `coverFrameSecond: number | null`

## API

- `POST /api/uploads`：额外接收 `covers` 文件列表，按 basename 配对
- `POST /api/draft-reviews`：可选 `cover` 文件
- `POST /api/assets/[assetId]/cover-from-frame`：`{ second }`
- `POST /api/draft-reviews/[id]/cover-from-frame`：`{ second }`
- `GET` 封面通过签名 URL 或复用现有私有文件读取

## UI

- 匹配页 Tab 切换
- 上传新批次复用导入向导逻辑（嵌入匹配页）
- 匹配列表 / 审片列表显示封面缩略图
- 「改选帧」：视频播放器 + 时间滑块 + 确认
