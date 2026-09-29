# ADR-0020: 已推送 Tag 删除后被 fetch 拉回

**状态：** 已接受
**创建时间：** 2026-09-28

> 当前状态 / 核心结论：**不是本扩展的删除失败。** `deleteTag` 确实执行了 `git tag -d`（本地 tag 被删除、UI 正确反映）；随后一次 `git fetch` 按 git 默认的 **tag auto-follow** 规则把 remote 上的同名 tag 重新拉回本地，于是 `git tag -l` 又出现它。决定：**不改代码**，仅在本 ADR 记录现象与机制。

---

## 背景（1-3 句）

用户通过右键菜单删除 tag 后，Tags 列表中该 tag 消失，但 `git tag -l` 确认本地 tag 仍然存在；重新加载后 tag 再次出现。

## 决策

1. **不改代码**：删除路径本身正确，tag 复现来自后续 `git fetch` 的行为，非本扩展可修复的缺陷。
2. **机制**：`git fetch` 默认开启 tag auto-follow——remote 上指向本次已取回对象的 tag 会被拉回本地。实测：删本地 tag 后执行 `git fetch` 或 `git fetch --all --prune`（本扩展 Fetch 的命令）该 tag 会重新出现；`git fetch --no-tags` 不会。
3. **常见触发源**：VS Code 内置 Git 的 `git.autofetch`（默认开启，含窗口聚焦时触发）会周期性执行 `git fetch`；本扩展自身的 Fetch 动作同样会触发。
4. **不做什么**：不改删除/确认文案与 Fetch 参数；不为已推送 tag 增加"同时删除 remote tag"的动作。

## 后果

- **收益：** 明确该现象为 git fetch 的既定行为，避免在删除路径上做无谓改动。
- **代价 / 权衡：** 若希望已推送的 tag 删除后不再出现，需自行关闭 `git.autofetch`；否则需改用"同时删除 remote tag"的操作（本 ADR 不提供）。

## 验证

1. `GitOperationService.ts#buildOperationArguments` 的 `deleteTag` case 自 `chore: initial commit` 起即返回 `['tag', '-d', '--', validateToken(operation.name, 'tag name')]`；`git log -S "'tag', '-d'"` 证实从未被改成创建命令。
2. 控制器级端到端用例（真实仓库建 tag → `runOperation` 发 `deleteTag` → 断言 git 中已删除、刷新后 refs 同步移除）通过。
3. 实测三种 fetch：`git fetch` 与 `git fetch --all --prune` 均把已删的本地 tag 拉回，`git fetch --no-tags` 不拉回。

## 实施位置

无需代码改动。机制涉及 `src/git/GitOperationService.ts#buildOperationArguments` 的 `fetch` / `deleteTag`。

## 下一步

无需后续动作。
