# ADR-0029: 无上游分支普通 Push 的防御校验

**状态：** 已接受
**创建时间：** 2026-11-05

> **当前状态 / 核心结论：** 普通 Push（非 force-with-lease）在发起前检查当前分支是否配置上游；无上游或游离 HEAD 时拒绝并提示使用 Publish Branch，避免 `push.default=matching` 下 `Everything up-to-date` 的静默假成功。已实施并通过验证；下一步：无需后续动作。

---

## 背景

ADR-0007 的遗留项指出：无上游分支执行裸 `git push` 时，`push.default=matching` 可能输出 `Everything up-to-date` 并以 0 退出，扩展会把「没有推送任何内容」当作成功。正常 UI 对无上游分支显示 Publish Branch，但 refs 快照暂时缺少当前分支（此时 `currentBranchHasUpstream` 回退为 true）或直接构造 `push` 操作时，仍可能落到普通 Push。

## 决策

1. **普通 Push 前置校验**：`GitOperationService.run` 在非 force-with-lease 的 `push` 执行前，用 `for-each-ref --format=%(upstream) refs/heads/<currentBranch>` 检查上游；为空则拒绝，提示 `This branch has no upstream. Use Publish Branch to push it and set its upstream.`；游离 HEAD 同样拒绝。
2. **守卫与 `push.default` 无关**：`simple` / `matching` / `current` / `upstream` / `nothing` 一律拒绝无上游普通 Push。扩展的 Push 语义固定为「推送已跟踪的当前分支」，设置上游只走 Publish Branch。
3. **补充错误提示**：为 Git 自身的 `has no upstream branch` 错误增加下一步提示，指向 Publish Branch，覆盖绕过前置校验的路径。
4. **不自动发布**：不把 Push 静默转换为 `publishBranch`，不自动写入 `branch.<name>.remote/.merge`；保持 Publish Branch 是实现上游绑定的唯一入口。
5. **不做什么**：不改变 `currentBranchHasUpstream` 在 refs 缺失时的保守回退（避免加载期误显示 Publish Branch）；不对 force-with-lease 做该校验（其目标由 `resolvePushPlan` 解析）；不改 Publish Branch 的远程解析规则。

## 后果

- **收益：** 消除 `push.default=matching` 下的静默假成功；无上游的普通 Push 在任何配置下都得到一致、可执行的错误。
- **代价 / 权衡：** 每次普通 Push 多一次 `for-each-ref`；`push.default=current` 用户若通过陈旧快照进入普通 Push，会改为收到「使用 Publish Branch」的提示，而非一次不带上游绑定的推送。
- **未解决风险：** refs 快照过期时用户仍需刷新后才能看到 Publish Branch；错误横幅的 Retry 可触发刷新。

## 实施位置

- 守卫：`src/git/GitOperationService.ts#run`（普通 `push` 分支前的前置校验）、`src/git/GitOperationService.ts#resolvePublishPlan`（沿用同一 `for-each-ref %(upstream)` 读取方式）。
- 提示：`src/git/classifyGitError.ts#classifyGitError` 的 `NEXT_STEPS` 表。
- 测试：`test/unit/GitOperationService.test.ts`（无上游 + `push.default=matching` / `current`）、`test/unit/GitErrorClassifier.test.ts`（`has no upstream branch` 提示）。

## 验证

- 集成：本地 bare remote 上创建无上游分支，`push.default=matching` / `current` / `simple` 时普通 Push 均被拒且远端 refs 不变；Publish Branch 成功并建立上游；建立上游后普通 Push 成功；游离 HEAD 时普通 Push 被拒。
- 单测：错误分类对 `has no upstream branch` 返回指向 Publish Branch 的 `nextStep`。
- 有上游的普通 Push 与 force-with-lease 路径不受影响（既有测试全通过）。
- 闸门：`npm test` 66 文件、690 通过 / 5 跳过；typecheck、lint、build 通过。

## 关联文档

- [ADR-0007: 无上游分支的一次性发布动作](ADR-0007-无上游分支的一次性发布动作.md) — 本 ADR 处理其遗留的 `push.default=matching` 静默假成功问题。

## 下一步

无需后续动作。
