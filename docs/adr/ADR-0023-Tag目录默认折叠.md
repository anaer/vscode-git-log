# ADR-0023: Tag 目录默认折叠

**状态：** 已接受
**创建时间：** 2026-09-29

> 当前状态 / 核心结论：Branches 面板 Tags 组下的**目录节点默认折叠**（remote 根如 `origin`、tag 命名空间如 `release`），使根下平铺列表成为主入口；用户手动展开/折叠后该状态被记住，切换仓库后仅保留仍存在的目录键。

---

## 背景（1-3 句）

ADR-0021 让 Tags 组在根下平铺全部 tag，并额外按 remote 归入目录。当一个 remote 通告大量 tag 时，remote 目录节点默认展开会让根下平铺列表被推得很远，面板首屏信息密度反而下降。

## 决策

1. **默认折叠 tag 目录**：Tags 组内所有目录节点初始为折叠态（`collapsedRefFolders` 初始注入其键）。
2. **用户操作优先**：用户点击后的展开/折叠状态覆盖默认值，并在会话内保持；搜索过滤时的强制展开（`forceExpanded`）仍优先于二者。
3. **键随仓库回收**：目录键格式为 `<repositoryId>:<kind>:<directoryId>`；切换仓库时通过 `reconcileCollapsedFolders` 丢弃已不存在的键，避免集合无界增长。
4. **不影响其他组**：Local / Remote 组的目录保持原有的默认展开行为，仅 tag 组默认折叠。
5. **不做什么**：不引入持久化（不写入 `vscode.setState` 之外的存储），不改 `buildRefTree` 的树结构。

## 后果

- **收益：** Tags 组首屏以根下平铺列表为主，remote 目录收起后不挤占纵向空间；信息层级更清晰。
- **代价 / 权衡：** 需要维护"默认折叠键"与"用户已操作的键"两个集合，并做逐次增量对账；逻辑集中在 `reconcileCollapsedFolders` 便于单测。
- **已知限制：** 目录键的 `directoryId` 由路径段数组经 `JSON.stringify` 得到（如 `["origin","release"]`），依赖 `buildRefTree` 的 id 生成规则；若该规则变更需同步调整测试。

## 实施位置

`webview/src/webviewUtils.ts`（`reconcileCollapsedFolders`：按存活键、默认折叠键、用户已操作键三者在每次 refs 变化时收敛折叠集合）、`webview/src/buildRefTree.ts`（`collectRefFolderKeys`：从树中提取目录键，键格式与面板一致）、`webview/src/App.tsx`（`liveRefFolderKeys` 派生 + 对账 `useEffect`、`touchedRefFolders` ref 记录用户操作）、`webview/src/RefsPane.tsx`（`collapsedFolders.has(folderKey)` 决定折叠，键格式 `<repositoryId>:<kind>:<directoryId>`）。

## 下一步

无需后续动作。

## 关联文档

- [ADR-0021: Tags 平铺展示与远程分组](ADR-0021-Tags平铺展示与远程分组.md) — 决定 Tags 组的树结构与展示顺序，本 ADR 规定其目录节点的初始折叠态。
- [ADR-0022: 远程 tag 探测缓存](ADR-0022-远程tag探测缓存.md) — `pushedTo` 的缓存策略影响 remote 目录的出现时序。
- [ADR-0019: Tag 本地与远程区分标识](ADR-0019-Tag本地与远程区分标识.md) — `pushedTo` 决定哪些 tag 会出现在 remote 目录下，从而决定默认折叠的目录数量。
