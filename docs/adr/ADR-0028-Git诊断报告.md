# ADR-0028: Git 诊断报告

**状态：** 已接受
**创建时间：** 2026-11-05

> **当前状态 / 核心结论：** 新增 `Git Log: Show Diagnostics`，把扩展/VS Code 版本、Git 路径与版本、能力集、仓库与操作状态写入现有 Output Channel，凭据脱敏。已实施并通过验证；下一步：无需后续动作。

---

## 背景

版本兼容性问题需要用户手动收集 Git 版本、仓库根目录与操作状态；能力集已经存在于初始化流程，但没有对用户暴露。

## 决策

1. **命令与内容**：命令面板新增诊断命令；报告包含扩展版本、VS Code 版本、平台、`gitLogWorkbench.git.path`、检测到的 Git 版本与 `GitCapabilities`、工作区根数量、所选仓库的 root / git dir / common dir、当前分支与 HEAD、操作状态、未解决冲突标记、扫描深度与分页设置。
2. **输出方式**：写入现有 Git Log Output Channel 并 `show()`，不新增 webview；用户可直接复制。
3. **脱敏**：远程 URL 中的凭据按既有 `redactGitDiagnostic` 规则处理；不输出用户邮箱、环境变量或文件内容。
4. **不做什么**：不自动上报、不收集遥测、不生成 issue 链接、不写入剪贴板。

## 后果

- **收益：** 支持排障时一次拿到关键事实，减少来回询问。
- **代价 / 权衡：** 输出内容会随功能增加而维护；用户需手动复制。
- **未解决风险：** 仓库路径可能包含用户名等本地信息，报告由用户主动触发并只写本地 Output。

## 实施位置

- `src/extension.ts`（命令注册与数据收集）、`src/repositories/discoverRepositories.ts#ensureSupportedGit`、`src/repositories/discoverRepositories.ts#resolveGitCapabilities`、`src/git/classifyGitError.ts#redactGitDiagnostic`、现有 Output Channel。

## 验证

- 纯函数报告构造单测覆盖完整字段、空工作区与 `gitVersionError` 脱敏。
- 命令注册测试通过；报告写入现有 Git Log Output Channel。
- 未在真实 VS Code 窗口中手动执行该命令（集成测试在发布流水线运行）；核心数据构造已由单测覆盖。
- 闸门：`npm test` 66 文件、688 通过 / 5 跳过；typecheck、lint、build 通过。

## 关联文档

- [ADR-0024: 最低 Git 版本降至 2.20 与能力驱动的功能隐藏](ADR-0024-最低Git版本与能力隐藏.md) — 诊断报告直接展示该篇定义的 Git 能力集；能力模型变化时需同步复核报告字段。

## 下一步

无需后续动作。
