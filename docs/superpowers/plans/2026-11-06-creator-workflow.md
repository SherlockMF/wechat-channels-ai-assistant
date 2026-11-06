# 创作工作流实施计划

用户已批准前两批实施。本轮按 executing-plans 分模块实现并审查。

**Goal:** 去除默认 RSSHub 依赖，完成编辑拍摄辅助和账号创作资料沉淀。

**Architecture:** 热点适配、编辑器辅助、创作资料库三个独立模块，根任务负责持久化脚本快照与生成表单集成。保持 Next.js/React/TypeScript 与已有本地数据架构。

**Tech Stack:** Next.js、React、TypeScript、Zod、Vitest、现有 Provider。

## Global Constraints

- 不新增依赖、不改用户素材、不输出凭证、不自动发布、不提交未经验证的成功结论。
- 现有主流程、研究来源和版本记录保留；跨模块修改先明确接口。

## Task 1：默认直连热点

Files: `apps/web/lib/hotspots/{sources,feed,types}.ts`、新 adapters、热点设置 UI、共享 source kind、相关测试和热点文档。

- [x] 写六平台响应解析、独立失败、旧默认源迁移测试，确认失败。
- [x] 直接适配平台接口，保留 URL 校验、超时与响应大小限制；默认九源。
- [x] RSSHub 从默认设置和启动文档移除，旧配置可读取，逐源错误说明根因。
- [x] 相关 Vitest 与无缓存实时请求逐源验证。

## Task 2：编辑辅助和提词器

Files: `features/script-workbench/script-detail.tsx`、独立编辑器组件/hooks、`api/scripts/[scriptId]/assist/route.ts`、`lib/script-workbench/editing.ts`、tests。

- [x] 写过期选区拒绝、保存顺序、模型结果预览的行为测试并确认失败。
- [x] 局部改稿 API 使用所属稿件与账号上下文，无凭证时明确报错，不能伪造结果。
- [x] 自动保存串行化、错误状态和离开提醒；结果应用检查原始文本。
- [x] 提词器复用现有口播数据，支持编辑后纯正文、键盘、暂停和镜像。
- [x] 单元测试和页面交互验收。

## Task 3：创作资料库

Files: `lib/creator-studio/{types,store,service}.ts`、`app/api/creator-studio/route.ts`、`app/creator-studio/page.tsx`、`features/creator-studio`、navigation、tests。

- [x] 写 owner 隔离、CRUD、日期/必填字段、召回和样本变化失效测试，确认失败。
- [x] 实现语气样本、真实素材、栏目、选题池完整存储/API/UI。
- [x] 实现手动学习、失败显示、空样本清空语气，模型上下文区分风格和事实。
- [x] 导出 spec 定义的 buildCreatorContext、creatorContextPrompt、markTopicWritten 接口。
- [x] 单元/API 测试与页面验收。

## Task 4：生成集成

Files: shared-types 的 ScriptDraft/Input、local/cloud repository、script Provider、script-create-form、脚本详情快照展示、tests。

- [x] 栏目必填和持久化快照测试先失败。
- [x] 生成表单加载栏目，接选题预填；添加 creatorSectionId、creatorSectionInputs、creatorTopicId。
- [x] 两个 repository 生成时捕获 profile/context，Provider 注入，成功落盘后关联选题。
- [x] 编辑器学语气入口与热点收藏入口连到资料 API。
- [x] 验证原稿不受账号后续修改影响。

## Task 5：Docker 与验收

- [x] 清点项目依赖并移除本项目 RSSHub 启动配置；Docker 无法启动，用户明确选择保留数据，未删除容器、卷、镜像或卸载 Docker。
- [x] 全套测试、typecheck、build，浏览器验证主流程；修复发现的问题。
- [x] 独立代码审查，检查用户要求逐项覆盖，记录未验证的真实模型调用与运行环境限制。

## 验收结果（2026-11-06）

- `npm test -- --run`：27 个测试文件、269 项通过。
- `npm run typecheck`：通过。
- `npm run build`：vinext 五阶段构建通过；保留原有 webpack 部分兼容与代理环境提示。
- `git diff --check`：通过。
- 无缓存热点实测：九源全部成功，共 170 条；首次极客公园超时，检查后重新执行整批成功。平台接口仍可能随上游变化。
- 浏览器验证：四面板切换保留输入、提交期间锁定及失败后恢复；栏目必填、选题预填、真实素材召回、账号与素材快照落盘；删除源资料后历史快照不变。
- 编辑器验证：手动保存后刷新保留；模拟保存失败后刷新恢复副本并自动保存；选区改写预览不自动写入、正文变化时阻止应用、确认后保存（改写成功响应为验收拦截）。
- 提词器验证：只取当前口播，排除拍摄素材，开始/空格暂停、镜像及桌面视觉正常。
- 真实模型请求返回 `qwen-plus` 无调用权限；生成如实标记为 mock-degraded，局部改稿显示实际错误。未确认真实模型改写/语气学习效果，未更改模型或凭证。
- D1 通过真实 SQLite 适配测试，未部署云端。资料页桌面 1440/1024 正常；移动端仍受既有全站 `min-width:1024px` 限制，本轮未改全局布局。
- 验收数据使用独立 owner，创建的稿件、素材、栏目、选题已通过 API 删除。
- Docker 数据按用户要求保留，未恢复出厂设置，未卸载；本机服务启动问题独立于应用代码。
- 本机设置仅清空旧 RSSHub 地址；删除 `docker-compose.rsshub.yml`，保留主部署 compose。其他项目 Docker 数据是否需要保留仍不确定，按用户决定停止清理。
- 交叉审查发现并修复：未保存内容恢复、多个 `说:` 行提取、D1 存储、资料表单输入丢失、选题关联失败影响已保存稿件、删除栏目后历史稿再生成受阻。
- 验收在 `codex/studio-workflow` 分支完成；未执行云端部署。