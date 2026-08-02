# 脚本工作台：拍摄与剪辑指导

## 目标

在脚本生成流程中，按「已拍摄 / 未拍摄」产出独立的拍摄与剪辑指导：已拍摄侧重素材描述 + 剪辑建议；未拍摄侧重拍摄分镜 + 剪辑建议。口播线与跟拍/成片线均支持。

## 已确认决策

| 决策 | 选择 |
|------|------|
| 适用范围 | 口播线 + 跟拍/成片线 |
| 选择粒度 | 整条脚本选一次 |
| 选择时机 | 新建时必选，生成时按状态写入产出 |
| 已拍摄素材 | 可选填；有则贴合，无则按文案推断 |
| 产出形态 | 新增独立区块，不改现有口播/时间线结构 |
| 实现路径 | 生成时一并产出（一次请求） |

## 数据模型

### 输入扩展（`ScriptDraftInput`）

- `shootStatus`: `"shot" | "unshot"`（新建必填；旧数据缺省时生成侧按 `unshot`）
- `materialNotes?: string`（仅 `shot` 时表单展示；可选）

### 输出扩展（`ScriptDraftOutput.productionGuide`）

```ts
{
  shootStatus: "shot" | "unshot";
  editGuidance: string[];           // 两种状态都有
  materials: {                      // 仅 shot 有内容，否则 []
    section: string;
    description: string;
  }[];
  storyboard: {                     // 仅 unshot 有内容，否则 []
    order: number;
    shot: string;                   // 画面
    camera: string;                 // 运镜/景别
    durationHint: string;           // 时长建议
    voiceCue: string;               // 对应口播/提词
  }[];
}
```

- `productionGuide` 对新生成结果必填；读取旧稿时可选（UI 缺则不展示该区块）。
- 现有 `script` / `brollCues` / `timeline` 等字段不变。
- `plainText` 末尾追加「拍摄与剪辑指导」段落，便于一键复制。

## 生成逻辑

1. 表单提交带上 `shootStatus`（及可选 `materialNotes`）。
2. Mock / DashScope prompt 根据状态分支：
   - `shot`：产出 `materials`（优先用 `materialNotes`，否则按文案推断）+ `editGuidance`；`storyboard` 为空。
   - `unshot`：产出 `storyboard` + `editGuidance`；`materials` 为空。
3. `editGuidance` 覆盖节奏、转场、字幕卡点、BGM、删补等可执行建议。
4. LLM 解析失败仍回退 mock；mock 必须带完整 `productionGuide`。
5. 再生成沿用原 `input.shootStatus`（旧稿无此字段则按 `unshot`）。

## UI

### 新建（`/scripts/new`）

- 增加「拍摄状态」二选一：已拍摄 / 未拍摄（默认未拍摄）。
- 选已拍摄时显示「手头素材描述（可选）」文本域。
- 与现有形态字段并存；不替代 `shotNotes`（项目完工的已拍/计划画面仍保留）。

### 详情（`/scripts/[id]`）

- 在口播/时间线卡片之后、可编辑全文之前，新增「拍摄与剪辑指导」卡片：
  - 状态徽章（已拍摄 / 未拍摄）
  - 已拍摄：素材描述列表 + 剪辑建议
  - 未拍摄：分镜表 + 剪辑建议
- 全文复制仍走 `plainText`（已含该区块）。

## 错误与兼容

- API Zod：`shootStatus` 缺省时默认 `unshot`，避免旧客户端/再生成崩。
- 旧草稿无 `productionGuide`：详情不展示该卡，全文不追加。
- 不上传真实视频；本功能只产出文案级指导。

## 测试

- Schema 接受带 `productionGuide` 的 koubo/follow 输出。
- Mock：`shot` 有 materials、无 storyboard；`unshot` 相反；`plainText` 含「拍摄与剪辑指导」。
- `materialNotes` 出现在 materials 描述中（shot 路径）。

## 非目标

- 按段切换已拍/未拍
- 详情页改状态后局部重算（需再生成新记录）
- 剪映工程导出、视频上传、与审片硬关联
