# ADR-0027: Pull 策略选择

**状态：** 已接受
**创建时间：** 2026-11-05

> **当前状态 / 核心结论：** 新增 `gitLogWorkbench.pull.strategy`（`default` / `ff-only` / `merge` / `rebase`，默认 `default`），主按钮按设置执行；工具栏右键菜单与命令面板提供三种显式覆盖。已实施并通过验证；下一步：无需后续动作。

---

## 背景

当前 Pull 固定执行裸 `git pull`，结果取决于用户全局 `pull.rebase` / `pull.ff` 配置；分叉时行为不可预期，也无法在界面上明确选择合并或变基。

## 决策

1. **新增设置** `gitLogWorkbench.pull.strategy`：`default` 保持裸 `git pull`；`ff-only` / `merge` / `rebase` 分别映射 `--ff-only`、`--no-rebase`、`--rebase`；非法配置值回退 `default`。
2. **入口**：主 Pull 按钮使用设置值；工具栏右键菜单与命令面板提供三种显式策略（覆盖设置，不改变默认值）。
3. **参数与校验**：`pull` 操作新增可选 `strategy`，非法值拒绝；参数数组构造，不经 shell。
4. **不做什么**：不实现 autostash、submodule 递归、pull 前预览/确认；`--ff-only` 失败由错误提示引导改用 merge/rebase。

## 后果

- **收益：** 拉取策略显式、可预期，避免全局配置造成的隐式行为。
- **代价 / 权衡：** 多一个设置与三个入口；主按钮行为依赖设置，用户需知道当前默认策略。
- **未解决风险：** merge/rebase 可能产生新提交或改写本地提交；本 ADR 不增加额外确认。

## 实施位置

- `src/protocol/messages.ts`（`pull.strategy`）、`src/git/GitOperationService.ts#buildOperationArguments`（参数映射）、webview 工具栏与菜单、`src/extension.ts` 命令注册。

## 验证

- 参数构造单测覆盖 `default` / `ff-only` / `merge` / `rebase` 与非法值。
- 控制器：主 Pull 使用配置默认值，显式 strategy 原样透传；面板读取配置时非法值回退 `default`。
- UI/命令：工具栏菜单提供三种显式项；命令注册测试确认三个命令分别发出对应策略。
- 闸门：`npm test` 66 文件、688 通过 / 5 跳过；typecheck、lint、build 通过。

## 下一步

无需后续动作。
