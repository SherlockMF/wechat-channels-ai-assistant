# 创作工作流两批改进

用户已批准按 2026-11-06 对照评估的前两批实施；保留当前 React/Next.js、Provider、研究引用、人工编辑稿和历史版本架构，不做 SaaS、支付、发布自动化或依赖扩张。

## 第一批

- 将默认热点改为平台直连：微博、百度、抖音、头条、36氪、B站，保留三个官方 RSS。独立失败、响应上限、超时、URL 校验与研究快照继续有效；历史 RSSHub 配置可读取但默认不再依赖服务。逐源验收，不以单个成功替代全部通过。
- 脚本编辑器选区改写：前后文和账号快照参与请求，结果先预览，应用前核对原文未变，允许取消，禁止静默覆盖编辑。
- 防抖自动保存、串行请求、保存状态、失败重试及离开提醒；后到响应不得覆盖新输入，旧稿切换不得污染新稿。
- 基于现有口播稿及 deliveryGuide 做提词器：大字、速度、暂停、镜像、进度与键盘控制；编辑后使用当前稿，不使用过期的提示。

## 第二批

新增 `/creator-studio` 创作资料工作台，当前仍为单账号定位，每个 owner 单独存储。语气样本只能由用户明确加入；可管理、删除、手动重新学习，失败保留样本并明确报错。模型不得把学习样本当作新的事实。

素材含标题、类型、正文和标签，按主题字面匹配召回最多六条。栏目含名称、用途、规则和带稳定 id 的必填/选填字段。选题含题目、备注、来源、排期日期、状态及关联稿件；从热点收藏或手动创建，选“写这条”只预填创作，不自动调用模型。

脚本 input 增加可选 creatorSectionId、creatorSectionInputs、creatorTopicId。生成时验证必填栏目素材、保存账号定位和创作资料快照，注入已确认的语气及真实素材。完成生成后关联选题；失败不能将选题标成完成。

## 模块接口

`lib/creator-studio/service.ts` 导出 `buildCreatorContext(ownerId, {topic, sectionId?, sectionInputs?})` 和 `creatorContextPrompt(snapshot)`。

`CreatorContextSnapshot` 定义在 `lib/creator-studio/types.ts`，返回可 JSON 序列化数据：capturedAt、styleDigest、styleExcerpts、materials、section、sectionInputs。持久化脚本使用 shared-types 中兼容结构，不反向导入 web 层。

`POST /api/creator-studio` 使用 action 区分样本、素材、栏目、选题修改及学习；具体 schema 与页面同一任务实现。`GET` 返回 `{state}`。`markTopicWritten(ownerId, topicId, draftId)` 在稿件成功保存后关联选题。

## 数据和验证

- 不增加依赖；复用已有 Zod、文件存储、模型调用和 UI。
- 资料写入串行化及原子替换，非法 id/日期拒绝，owner 隔离，文件损坏报错不得覆盖成空库。
- 快照只存创作资料，绝不保存 Provider 凭证；改定位不会改变历史快照。
- 新行为先写失败测试；覆盖直连接口解析、失败隔离、并发保存、过期选区、素材召回、栏目校验、样本删除重学、选题关联和快照。
- 运行相关测试、全套测试、typecheck、构建；浏览器检查主要交互。

## Docker 清理

先盘点 D:/OPC 下部署配置及本机容器、镜像、数据卷。只移除确认属于 RSSHub 的资源。仅当确认其他项目不使用本机 Docker 且无需要保留的数据时卸载；不能根据服务停止推断磁盘为空。
