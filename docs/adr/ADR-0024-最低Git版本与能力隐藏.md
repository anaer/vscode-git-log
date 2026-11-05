# ADR-0024: 最低 Git 版本降至 2.20 与能力驱动的功能隐藏

**状态：** 已接受
**创建时间：** 2026-11-05

> **当前状态 / 核心结论：** 最低支持 Git 由 2.27 降至 **2.20**，已实施并通过真实 Git 2.20 冒烟；启动时按版本推导 Git 能力集并随初始化下发，宿主不支持的功能入口自动隐藏（当前唯一受影响项：需要 2.23+ 的孤儿分支创建）；内部命令改为版本中性写法，保证 2.20 上核心链路可用。下一步：无需后续动作。

---

## 背景

当前 2.27 的硬门槛会拦掉 Ubuntu 20.04（约 2.25）、Debian 10（约 2.20）这类仍在使用的环境；而现有调用点中未发现 2.25–2.27 才引入的依赖，最高门槛是 2.24 的 `git log --end-of-options`。用户要求最低降到 2.20，并对旧版本不支持的功能自动隐藏入口。

## 决策

1. **硬门槛 2.27 → 2.20**：`ensureSupportedGit` 的阈值与错误文案、README / CONTRIBUTING、相关测试同步；低于 2.20 仍在启动阶段整体失败，不做部分降级。
2. **能力集随初始化下发**：由检测到的版本推导 `GitCapabilities`（`version` + `createOrphanBranch`），通过 `initialize` 消息写入 webview 状态；字段缺失时一律视为「不支持」，避免旧缓存误显示入口。
3. **入口隐藏 + 宿主拒绝双保险**：`createOrphanBranch === false` 时不渲染 HEAD 右键菜单中的 “Create Orphan Branch…”；`runOperation` 仍校验能力并返回可读错误，防止陈旧 UI 或协议调用触发 `git switch --orphan` 的未知选项错误。
4. **内部命令版本中性化，不隐藏功能**：
   - 移除 `git log --end-of-options`（2.24）；分支过滤器仍要求是 `query.refs` 中的完整 refname，控制器与 `getLog` 各有一层 knownRefs 白名单，`refs/` 前缀使其不可能被解析为选项。`--end-of-options` 原有的注入防护由该白名单等价承接。
   - 四处 `git branch --show-current`（2.22）改走 `git symbolic-ref --quiet --short HEAD`（与仓库发现流程同一写法）；游离 HEAD 的失败退出映射为原先的空分支，提交历史改写类功能在 2.20 上保持可用。
5. **不做什么**：不为 <2.23 提供 `checkout --orphan` 降级（与一步式移除已跟踪文件的语义不同，直接隐藏入口）；不自动安装 / 升级用户 Git；不改变 ≥2.23 环境上的现有行为。

## 后果

- **收益：** 覆盖 2.20 起的旧发行版；旧版本上历史浏览、文件历史与提交改写可用，仅孤儿分支入口消失。
- **代价 / 权衡：** 移除 `--end-of-options` 后，日志参数安全依赖「过滤器必须是已知完整 refname」这一不变量；若将来允许任意分支字符串，必须恢复参数校验或按版本条件加回标记。
- **未解决风险：** 仓库仍无旧版 Git 的 CI 矩阵，2.20 仅由一次便携版冒烟覆盖核心路径；能力集需随以后新增的版本相关功能维护。另在本次测试机上，Git for Windows 2.20 未能检测到已提交文件的二次改动（工作区被判 clean），冒烟改用空提交；Windows 用户仍建议使用较新 Git。

## 证据分档

| 假设 | 档位 | 取证方式 |
|------|------|----------|
| `git log --end-of-options` 自 2.24 可用 | 已证实 | v2.23 源码无该分支、v2.24 `revision.c` / `parse-options.c` 有；2.24 发布说明 |
| `git switch --orphan` 自 2.23 可用 | 已证实 | v2.23 `git-switch` 文档已列出 `--orphan` |
| `git branch --show-current` 自 2.22 可用 | 已证实 | v2.21 文档无、v2.22 文档有 |
| 其余调用在 2.20 上行为一致 | 部分证实 | 逐项比对引入版本（最高为 2.15 的 `--is-shallow-repository`）；Git 2.20.0.windows.1 冒烟覆盖 refs、分支过滤日志、精确哈希、提交改写 |

## 实施位置

- 版本与能力：`src/repositories/discoverRepositories.ts#ensureSupportedGit`（阈值 2.20）、`src/repositories/discoverRepositories.ts#inspectRepository`（`symbolic-ref` 先例）、`src/shared/models.ts`（新增 `GitCapabilities`）。
- 下发与防护：`src/protocol/messages.ts`（`initialize` 增 `gitCapabilities`）、`src/webview/WorkbenchController.ts#initialize`（检测并缓存）、`src/webview/WorkbenchController.ts#runOperation`（不支持时拒绝）。
- 前端隐藏：`webview/src/workbenchStore.ts`、`webview/src/workbenchMessageProcessing.ts`（写入能力）、`webview/src/App.tsx`（派生入口开关）、`webview/src/ContextMenu.tsx#ContextMenu`（条件渲染孤儿入口）。
- 内部兼容：`src/git/logQuery.ts#buildLogArguments`（去掉标记，支持 `revision` / `noWalk`）、`src/git/GitService.ts#getLog`（精确哈希改用 `--no-walk`）、`src/git/GitOperationService.ts#readCurrentBranch`（新增 `symbolic-ref` 辅助）、`src/git/GitOperationService.ts#planCommitRangeRewrite`、`src/git/GitOperationService.ts#planCommitPatch`、`src/git/GitOperationService.ts#assertRewritePlanStillCurrent`、`src/git/GitOperationService.ts#assertCommitPatchStillCurrent`（改走该辅助）。
- 文案：`src/git/classifyGitError.ts#classifyGitError`、`README.md`、`README.zh-CN.md`、`CONTRIBUTING.md`。

## 验证

- 单测：2.19 拒绝 / 2.20 通过；能力在 2.22 / 2.23 边界切换；无能力时 `runOperation` 拒绝；孤儿入口在无能力时不出现在 HEAD 菜单；`buildLogArguments` 快照去掉 `--end-of-options` 并覆盖 `--no-walk`；游离 HEAD 改写仍被拒绝。
- 真机：Git 2.20.0.windows.1 便携版通过 refs、分支过滤日志、精确哈希搜索与提交改写冒烟；`resolveGitCapabilities` 返回 `createOrphanBranch: false`。文件历史与分支删除未纳入本次冒烟（受该版本在本机的工作区改动检测问题影响）。
- 闸门：`npm run typecheck` 通过；`npm run lint` 0 error（2 条既有 warning）；`npm run build` 通过且产物含新逻辑；`npm run test:unit` 661 通过 / 1 失败，失败为既有的日期依赖用例（`DateRangePicker` 假设当前月早于 2026-09 的 minDate），与本次改动无关。

## 关联文档

- [ADR-0012: 支持创建孤儿分支](ADR-0012-支持创建孤儿分支.md) — 该功能依赖 `git switch --orphan`（2.23+）；本 ADR 规定 2.20–2.22 上隐藏其入口，并同步更新该篇的兼容性表述。
- [ADR-0028: Git 诊断报告](ADR-0028-Git诊断报告.md) — 诊断报告展示本 ADR 定义的 Git 能力集；能力模型变化时需同步复核报告字段。

## 下一步

无需后续动作。
