# ADR-0031: 旧版 Git 测试夹具兼容

**状态：** 已接受
**创建时间：** 2026-11-05

> **当前状态 / 核心结论：** 测试夹具的 Git 2.20 兼容改造已落地并验证；「系统 Git + Git 2.20」CI 矩阵随工作流删除而排除，发布通道由本机 `vsce publish` 承载（见 ADR-0033），旧版验证靠本机便携版冒烟。下一步：无需后续动作。

---

## 背景

ADR-0024 将最低支持版本降至 2.20，但测试夹具大量使用 `git init -b main`（2.28+）、`git branch --show-current`（2.22）、`git switch`（2.23+）与孤儿分支（2.23+），在 2.20 上会大面积失败。曾据此新增 `ci.yml` 跑双版本矩阵，该工作流文件后被删除。

## 决策

1. **夹具兼容写法**：`git init -b main` 改为 `git init` + `git symbolic-ref HEAD refs/heads/main`；`git branch --show-current` 断言改为 `git symbolic-ref --short HEAD`；`git switch` 改为 `git checkout`；孤儿分支服务端用例在 Git <2.23 时跳过。生产代码不因此改动。
2. **版本判断入口**：夹具侧统一用 `test/unit/support/gitVersion.ts` 做版本比较，避免各测试文件自行解析 `git --version`。
3. **CI 矩阵已排除**：`.github/workflows/ci.yml` 的双版本矩阵没有执行载体；ADR-0033 决定不恢复任何工作流，本 ADR 不为 CI 矩阵保留占位，也不另行立项。
4. **不做什么**：不增加 2.23 / 2.27 矩阵，不使用容器镜像，不在旧版 Git 上运行集成测试，不为本 ADR 保留占位工作流。

## 后果

- **收益：** 测试夹具不再隐含 2.28+ 命令，最低支持版本的回归可在本机用便携版 Git 复跑。
- **代价 / 权衡：** 旧版 Git 验证不进 CI，只能靠人工冒烟，回归覆盖随环境变化。
- **未解决风险：** 能力集需随以后新增的版本相关功能维护；夹具约定靠评审与本地便携版兜住，无自动闸门。

## 实施位置

- 测试支持：`test/unit/support/gitVersion.ts`（版本判断）、`test/unit/support/gitFixture.ts`（初始化仓库 / 读取当前分支）。
- 夹具改造：`test/unit` 下使用 `git init -b` / `git branch --show-current` 的测试文件；`GitOperationService.test.ts` 的孤儿分支用例。

## 验证

- 夹具改造后 `test/unit` 中 `git init -b` 与 `git branch --show-current` 归零；Git 2.20 便携版验证了 `init` + `symbolic-ref`、`check-mailmap`、`shortlog` 与 `log --no-walk`。
- 本地系统 Git 跑 `npm run test:unit` 全绿。
- 未执行：CI 矩阵从未在 GitHub Actions 上运行过；工作流删除后无从执行。

## 关联文档

- [ADR-0024: 最低 Git 版本降至 2.20 与能力驱动的功能隐藏](ADR-0024-最低Git版本与能力隐藏.md) — 本 ADR 保留其夹具兼容改造，CI 验证仍缺。
- [ADR-0033: 发布通道改为本地 vsce publish](ADR-0033-发布通道改为本地vsce-publish.md) — 该 ADR 决定不恢复任何工作流，本 ADR 的 CI 矩阵部分据此失去执行载体。

## 下一步

无需后续动作。
