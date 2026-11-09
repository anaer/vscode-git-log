# ADR-0033: 发布通道改为本地 vsce publish

**状态：** 已接受
**创建时间：** 2026-11-09

> **当前状态 / 核心结论：** 扩展发布不再由 GitHub Actions 触发，改由维护者本机执行 `npx vsce publish`；仓库不保留 `ci.yml` / `release.yml`，版本号与 CHANGELOG 段落、版本字面量用例三处在发布前手工同步。下一步：无需后续动作。

---

## 背景

原先发布由 `v*` tag 触发的 `release.yml` 完成（GitHub Release + Marketplace + Open VSX），另有 `ci.yml` 跑旧版 Git 矩阵；两个工作流文件已从仓库删除，`extensionContributions.test.ts` 仍有一条用例断言 `release.yml` 的内容，导致单测长期红。

## 决策

1. **发布入口**：只发布到 VS Code Marketplace，命令为 `npx vsce publish --no-dependencies --allow-missing-repository`，凭据取本机 `VSCE_PAT` 环境变量；token 不写入仓库、不进对话。
2. **发布前动作**：按日期串 `YY.MDD.HHmm` 递增 `package.json` 版本，把 `CHANGELOG.md` 的 `Unreleased` 段落改挂到新版本号下，并同步 `extensionContributions.test.ts` 中的版本字面量；三处必须同批完成，漏一处即单测失败。
3. **质量闸门**：发布前在本机跑 `npm run typecheck`、`npm run lint`、`npm run test:unit`、`npm run build`；VS Code 1.85.2 兼容由 `npm run test:integration` 本地执行，不再有 workflow 承载。
4. **用例处置**：删除断言 `release.yml` 内容的用例，保留断言 `scripts/run-integration.mjs` 默认测试版本的用例；不为已删除的工作流保留占位断言。
5. **不做什么**：不恢复任何工作流、不打 tag 触发发布、不经 GitHub Release 或 Open VSX 通道、不把 `VSCE_PAT` 落到仓库文件或 CI 密钥之外的位置。

## 后果

- **收益**：发布与凭据都留在本机，删除工作流后单测不再有长期失败项。
- **代价 / 权衡**：发布过程无 CI 轨迹与并发防护，版本号与 CHANGELOG 靠人工同步；ADR-0031 计划的旧版 Git CI 矩阵失去执行载体，最低版本回归只能靠本地便携版 Git 冒烟。
- **未解决风险**：`vsce publish` 需要网络与有效 PAT；同一版本号无法重复上传，误发需到 Marketplace 后台处理。

## 实施位置

- 发布命令与依赖：`package.json`（`scripts.package`、devDependencies 的 `@vscode/vsce`）。
- 版本字面量用例：`test/unit/extensionContributions.test.ts#extension contributions`。
- 变更史：`CHANGELOG.md` 的版本段落。

## 验证

- 本机 Windows + Git 2.56 删除该用例后 `npm run test:unit` 无失败项；`npm run typecheck`、`npm run lint`、`npm run build` 通过。
- `npx vsce publish --help` 确认 `--no-dependencies`、`--allow-missing-repository` 与 `VSCE_PAT` 口径可用。

## 关联文档

- [ADR-0031: 旧版 Git 测试夹具兼容](ADR-0031-旧版Git测试夹具兼容.md) — 该 ADR 的工作流载体由本决策确定移除，其夹具兼容部分保留。

## 下一步

无需后续动作。
