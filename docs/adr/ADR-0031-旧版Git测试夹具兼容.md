# ADR-0031: 旧版 Git CI 矩阵

**状态：** 提议中
**创建时间：** 2026-11-05

> **当前状态 / 核心结论：** 已新增 CI 工作流，矩阵为“系统 Git + Git 2.20”；2.20 从源码构建并缓存，两腿运行 lint / typecheck / unit / build；测试夹具已改为 2.20 兼容写法。下一步：推送后观察首次 GitHub Actions，两腿通过后转为 `已接受`。

---

## 背景

ADR-0024 将最低支持版本降至 2.20，但仓库没有旧版 Git CI；2.20 仅有一次性便携版冒烟。现有测试夹具大量使用 `git init -b main`（2.28+）、`git branch --show-current`（2.22）与孤儿分支（2.23+），直接加矩阵会大面积失败。

## 决策

1. **工作流**：新增 `.github/workflows/ci.yml`，在 push / pull_request / workflow_dispatch 触发；矩阵 `git: [system, '2.20']`，`fail-fast: false`。
2. **Git 2.20 获取**：从源码构建 `v2.20.0`，关闭 curl / OpenSSL / expat / gettext / Tcl / Perl / Python；构建前缀缓存，命中缓存时跳过编译；使用前断言 `git --version` 为 `2.20.0`。
3. **测试范围**：两腿均执行 `npm ci`、`npm run lint`、`npm run typecheck`、`npm run test:unit`、`npm run build`；VS Code 集成测试继续由 release workflow 在系统 Git 上覆盖，不进入本矩阵。
4. **测试夹具兼容**：`git init -b main` 改为 `git init` + `git symbolic-ref HEAD refs/heads/main`；`git branch --show-current` 断言改为 `git symbolic-ref --short HEAD`；`git switch` 改为 `git checkout`；孤儿分支服务端用例在 Git <2.23 时跳过。生产代码不因此改动。
5. **不做什么**：不增加 2.23 / 2.27 矩阵，不使用容器镜像，不在旧版 Git 上运行集成测试，不改变 release workflow。

## 后果

- **收益：** 最低支持版本由真实 CI 验证，避免只靠人工冒烟；测试夹具不再隐含 2.28+ 命令。
- **代价 / 权衡：** 新增构建/缓存步骤与测试夹具改动；旧版 Git 腿只覆盖单元测试与静态检查，UI 集成仍由 release workflow 覆盖。
- **未解决风险：** Git 2.20 从源码构建依赖 `ubuntu-latest` 工具链；若上游编译器变化导致构建失败，需要固定构建镜像或改用预构建二进制。CI 未在本地执行，需以首次工作流运行结果为准。

## 实施位置

- 工作流：`.github/workflows/ci.yml`（新增）。
- 测试支持：`test/unit/support/gitVersion.ts`（版本判断）、`test/unit/support/gitFixture.ts`（初始化仓库 / 读取当前分支）。
- 夹具改造：`test/unit` 下使用 `git init -b` / `git branch --show-current` 的测试文件；`GitOperationService.test.ts` 的孤儿分支用例。

## 验证

- 本地系统 Git：`npm test` 66 文件、693 通过 / 5 跳过；typecheck、lint、build 通过。
- 夹具改造后 `test/unit` 中 `git init -b`、`git branch --show-current` 与 `git switch` 均归零；Git 2.20 便携版验证了 `init` + `symbolic-ref`、`check-mailmap`、`shortlog` 与 `log --no-walk`。
- GitHub Actions 尚未执行；首次运行需确认两腿均通过、2.20 腿 `git --version` 为 `2.20.0`。

## 关联文档

- [ADR-0024: 最低 Git 版本降至 2.20 与能力驱动的功能隐藏](ADR-0024-最低Git版本与能力隐藏.md) — 本 ADR 补上其“无旧版 Git CI 矩阵”的风险项。

## 下一步

推送后观察首次 GitHub Actions 运行；两腿通过后把状态改为 `已接受`。
