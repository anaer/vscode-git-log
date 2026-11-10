# ADR-0042: 整文件 Blame 列

**状态：** 已拒绝
**创建时间：** 2026-11-09

> **当前状态 / 核心结论：** 提案已否决，不实施整文件 blame 列。编辑器内逐行归属归 VS Code 内置 blame 承担，本扩展保留现有当前行提示，不新增配置项；后续增强只在当前行能力内进行。下一步：无需后续动作。

---

## 背景

现有能力是「当前行」淡色提示与行历史，编辑器内没有逐行的归属视图。VS Code 1.85+ 自带 blame 装饰，本扩展再提供同类能力必须明确差异化与互斥规则，否则会出现两套重复装饰。

## 决策

1. **不提供整文件 blame 列**：编辑器内逐行归属归 VS Code 内置 `git.blame.editorDecoration.enabled`，本扩展不新增第三套逐行装饰，也不新增 `gitLogWorkbench.blame.fileColumn.enabled` 与 `maxBlameFileBytes` 配置。
2. **保留现有当前行提示**：`CurrentLineBlameController` 的淡色提示与内置装饰抑制逻辑保持不变；如需增强，只在既有当前行能力内做，不扩成整文件列。
3. **否决理由**：项目已有当前行装饰与行历史，内置 blame 与 GitLens 已覆盖逐行归属；再建一套按提交聚合的 `git blame --line-porcelain` 取数、逐行着色与跳转链路，增量价值低于大文件装饰重算与两套装饰互斥的维护成本。
4. **不做什么**：不做按提交聚合的整文件取数与缓存、不做单击跳转或双击定位、不做 2 MiB 阈值降级、不做「注解上一修订」递归追踪与渐变着色。
5. **重开条件**：仅当宿主内置 blame 发生实质变化（不再提供逐行装饰）时，修订本 ADR 重新评估；不因对照其他客户端而直接引入。

## 后果

- **收益：** 避免与内置 blame 及 GitLens 重叠，不引入大文件装饰重算的输入延迟风险，省下两项配置与一整条取数链路。
- **代价 / 权衡：** 本扩展内看不到逐行归属，用户需启用 VS Code 内置 blame 或使用现有行历史。
- **未解决风险：** 宿主能力变化可能使重新评估成为必要，需纳入版本升级复核。

## 实施位置

本决策不产生代码改动。现有当前行提示与互斥判定保持不变：`src/git/LineBlameService.ts#LineBlameService`、`src/editor/CurrentLineBlameController.ts#shouldUseCustomLineBlame`。

## 下一步

无需后续动作。
