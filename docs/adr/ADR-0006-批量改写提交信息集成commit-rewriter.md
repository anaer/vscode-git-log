# ADR-0006: 集成 commit-rewriter 批量改写提交信息能力

**状态：** 已接受
**创建时间：** 2026-09-16

> 当前状态 / 核心结论：已按契约落地。将 `simonw/commit-rewriter` 的批量改写消息算法移植为 `GitOperationService` 的 `rewriteCommitMessages` operation（纯 TS、非引入 Python/Web 服务）；复用现有 git runner 与 `hash-object --stdin` 输入通道，完整复刻 三阶段 check/rewrite/CAS 闭环、显式备份分支与 CAS `update-ref`，支持脏 worktree 与 merge commit，补齐现状只有 Amend HEAD 单条的空白。后端契约、前端交互与测试均已实现并验证通过。

**背景：**

评估外部工具 `simonw/commit-rewriter`（本地 Web 应用，批量编辑 `main` 最近 100 条 commit message）能否集成进本扩展。结论为可集成，但该工具有 Python/Starlette 运行时依赖，与本扩展「Git CLI 为事实源、纯 TS 扩展」架构冲突，故仅移植其核心算法。

**基线事实（对比现状）：**

- 现状批改消息：仅 Amend HEAD 单条（[Dialog/Amend](file:///d:/GitHub/vscode-git-log/webview/src/Dialogs.tsx)）；Drop/Squash 属 commit 变更，强制 clean worktree、拒绝 merge commit（[GitOperationService planCommitRangeRewrite](file:///d:/GitHub/vscode-git-log/src/git/GitOperationService.ts#L543)）。
- commit-rewriter 算法：`rev-list --topo-order --reverse --parents` 拓扑重映射 parent、剥离 `gpgsig/gpgsig-sha256/mergetag` 签名、`git hash-object -t commit -w --stdin` 重建对象、显式备份分支、`update-ref` 期望值 CAS 原子切换；允许脏 worktree（只改 message、tree 不变）。
- commit-rewriter -100 条上限、NUL/encoding 校验、进行中 Git 操作与跨 worktree 冲突校验需一并吸收。

## 决策

### 1. 移植而非外部调用（已选定）

在 `GitOperationService` 新增 `rewriteCommitMessages` operation，复刻 commit-rewriter 的重建+备份+CAS 闭环，纯 TS、零新增运行时依赖。**不**以内置副进程方式调用原版 Python 工具。

**不做什么：** 不引入 Python/Starlette/uv 运行时。

### 2. 复刻 commit-rewriter 安全前置校验

重写前校验：分支 tip 未变、非 shallow 克隆、无 unmerged、无进行中的 Git 操作（MERGE/CHERRY_PICK/REVERT/rebase/bisect/sequencer）、目标分支未被其它 worktree checkout；沿用现有 `OperationConfirmation` 破坏性确认与序列化写锁。

### 3. 允许脏 worktree、支持 merge commit

与现状 Drop/Squash 不同，本操作只重建 message、tree 不变，故校验通过后不要求 clean worktree；拓扑遍历推进至 merge commit 不影响父链正确性。

### 4. 实施边界（契约已确认并已实现）

- **后端契约**：`GitOperationRequest` 新增 `editCommitMessages { edits: Array<{ hash; message }> }`（复用 `commitMessagesLoaded` 的 `{hash,message}` 形态），校验沿用 `isGitOperationRequest` 判别联合【[messages.ts](file:///d:/GitHub/vscode-git-log/src/protocol/messages.ts)】。执行走专用分支（非 `buildOperationArguments`），复刻 commit-rewriter 三阶段：`planMessageRewrite`（校验可达）→ `patchMessageRewrite`（拓扑重建）→ `rewriteCommitMessages`（备份 + CAS update-ref）【[GitOperationService.ts](file:///d:/GitHub/vscode-git-log/src/git/GitOperationService.ts#L745)】。
- **重写目标**：当前检出分支 HEAD（与现有 drop/squash/Amend 一致）；选定 commit 须在当前分支可达，按拓扑序重写。
- **前端**：从 [ContextMenu.tsx](file:///d:/GitHub/vscode-git-log/webview/src/ContextMenu.tsx) Commit 菜单新增「Edit Commit Messages…」入口；对话框 [Dialogs.tsx](file:///d:/GitHub/vscode-git-log/webview/src/Dialogs.tsx) 复用 `requestCommitMessages`→`commitMessagesLoaded` 加载各 commit 现消息、每条消息一个可编辑 textarea，提交 `runOperation`；样式新增 `.edit-commit-messages-dialog/-list`【[styles.css](file:///d:/GitHub/vscode-git-log/webview/src/styles.css#L1428)】。**任意多选可达 commit（勿论连续）**。
- 保留 commit-rewriter 单次最多 100 条、NUL/空消息/超长拒绝、消息编码校验；复用 `getOperationConfirmation` 破坏性确认与 `getQueueKey` 队列锁。

## 后果

- 收益：补齐批量改写提交信息能力，脏工作区可用、支持 merge commit、支持任意多选可达 commit（非限制连续），比现状 Amend/Squash 更贴近 commit-rewriter 原版。
- 权衡：重写会改变全链 commit oid 并剥离 GPG/merge 签名（st-pad），破坏性需确认；备份分支 `commit-rewrite-backup/{stamp}`、reflog 消息沿用 commit-rewriter 约定。
- 已验证：`GitRunner` 已支持 `input`（stdin）通道用于 `hash-object --stdin`；新增集成与协议校验测试全绿，typecheck 无新增错误。

## 下一步

功能与测试已交付，维持现状观察后续使用反馈；无既定紧接任务。