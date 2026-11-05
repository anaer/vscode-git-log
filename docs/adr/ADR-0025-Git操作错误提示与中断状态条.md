# ADR-0025: Git 操作错误提示与中断状态条

**状态：** 已接受
**创建时间：** 2026-11-05

> **当前状态 / 核心结论：** 错误消息增加结构化的“下一步”提示；merge / rebase / cherry-pick / revert 统一为一条常驻中断状态条，动作集中到状态条（merge 新增 Abort）。已实施并通过验证；下一步：无需后续动作。

---

## 背景

现有错误分类只给出类别与一句话结论，用户仍需自行判断下一步；中断状态只有 rebase 有横幅，merge 无中止入口，cherry-pick / revert 的中止按钮散落在详情面板。

## 决策

1. **错误带下一步提示**：`ClassifiedGitError` 增加 `nextStep?: string`，由表驱动覆盖 `index.lock`、non-fast-forward push、`--ff-only` 拉取失败、脏工作区阻止 checkout、无远程、未知分支、冲突等场景；`error` 消息携带该字段，横幅以 `→ …` 展示。现有 `category` / `message` 不变。
2. **四种中断状态统一展示**：merge、rebase、cherry-pick、revert 共用一条状态条，显示当前操作、冲突标记与 `Open Source Control`。
3. **动作集中**：rebase 保留 Continue / Skip / Abort；merge 新增 Abort；cherry-pick / revert 的 Abort 移入状态条；存在未解决冲突时禁用 Continue。详情面板不再保留重复的 Stop 按钮。
4. **merge Abort 走破坏性确认**：新增 `mergeAbort` 操作（`git merge --abort`），确认文案说明会丢弃当前冲突解决进度；rebase Abort 的既有行为不变。
5. **不做什么**：本批不为 cherry-pick / revert 新增 Continue / Skip（继续用 Source Control），不增加冲突条数（只保留布尔标记），不改变 rebase 的 Skip 语义。

## 后果

- **收益：** 失败后可立即看到可执行建议；四种中断状态位置一致、动作可达，merge 不再无路可退。
- **代价 / 权衡：** 状态条承载更多状态，`rebase-status-row` 样式与测试需泛化；移除详情面板 Stop 按钮会改变既有交互路径。
- **未解决风险：** Abort 类操作仍可能丢失冲突解决工作；merge Abort 有确认，rebase Abort 维持现状。

## 实施位置

- 提示：`src/git/classifyGitError.ts#classifyGitError`、`src/webview/WorkbenchController.ts#postError`、`src/protocol/messages.ts`（error 消息新增字段）、webview 错误横幅。
- 状态条：`webview/src/App.tsx`（状态条渲染与动作）、`webview/src/styles.css`、`webview/src/DetailsPane.tsx`（移除 Stop 按钮）。
- 操作：`src/protocol/messages.ts`、`src/git/GitOperationService.ts#buildOperationArguments`、`src/git/GitOperationService.ts#getOperationConfirmation`（新增 `mergeAbort`）。

## 验证

- 单测：7 类常见失败样本命中预期 `nextStep`；控制器错误消息携带 `nextStep`。
- UI：rebase 与 merge 状态条渲染、冲突徽标、Abort 动作与下一 步提示均通过；详情面板不再有重复 Stop 按钮。
- 真机：`mergeAbort` 在真实冲突合并后回到干净工作区；无进行中合并时明确拒绝；确认文案为 `Abort Merge`。
- 闸门：`npm test` 66 文件、688 通过 / 5 跳过；typecheck、lint、build 通过。

## 下一步

无需后续动作。
