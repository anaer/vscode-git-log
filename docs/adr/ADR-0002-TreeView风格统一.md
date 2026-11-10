# ADR-0002: Tree 面板统一为 VSCode 原生 TreeView 风格

**状态：** 已接受
**创建时间：** 2026-09-07

> **当前状态 / 核心结论：** Branches 与 Changed Files 两个树面板统一为「受控折叠 + 内联 SVG chevron + CSS 变量定位缩进竖线 + status 靠右」风格。Changed Files 默认展示 List 视图；Tree 视图把连续的单子目录链压缩为一行 `src / main / java / com`。两项已实施并通过全量测试。下一步：无需后续动作。

---

## 背景（1-3 句）

两面板的树形展示此前缺乏统一视觉规范：Branches 用 Unicode 箭头（`›`/`⌄`）且叶节点有多余符号占位、无缩进引导线；Changed Files 依赖浏览器原生 `<details>`/`<summary>`，折叠箭头样式不可控、无竖线；两处缩进不一致，与 VSCode 原生观感不符。Changed Files 的 Tree 视图还逐层展开每个路径段，`src/main/java/com/…` 这类深路径在窄面板里要展开四层才能看到文件，而只想看文件清单的用户并不需要目录层级。

## 决策

1. **折叠图标统一为内联 SVG chevron**：`icons.tsx` 导出 `ChevronRight`/`ChevronDown`（16×16）为公共资源，替代 Unicode 箭头与 `<summary>` 三角标记；仅当前分支 `HEAD` 保留 `●` 徽章，其余目录/叶节点图标与符号移除。
2. **受控折叠状态**：折叠由 React state（`Set<string>`）驱动，不再依赖 `<details>`；每面板维护独立折叠 state（Branches：`collapsedRefGroups`/`collapsedRefFolders`；Changed Files：`collapsedFileDirectories`）；折叠 key 用目录路径，保证跨渲染稳定。
3. **缩进竖线引导线**：每层缩进 14px；竖线由容器伪元素 `.ref-tree-directory::before`/`.file-tree-directory::before` 绘制，位置 = 容器 CSS 变量 `--indent-guide-left` + 8px（chevron 半宽），使竖线对准折叠图标中心。**关键约束**：`--indent-guide-left` 必须定义在**外层容器 div** 上而非内层 `<button>`——CSS 变量沿祖先链向上查找，定义在子元素时伪元素读不到会回退 `0px`、致所有竖线重叠最左。
4. **Changed Files status 靠右**：status（`A`/`M`/`D`/…）从行首移到行尾；行宽 `width: 100%`（配合 `box-sizing: border-box`），status 用 `margin-left: auto` 相对面板右对齐；`.file-path` 可收缩（`flex: 1 1 auto` + ellipsis），超长文件名省略以保持 status 可见；List 视图一并靠右。
5. **Changed Files 默认 List**：`WorkbenchLayout.filesViewMode` 默认值为 `list`，定义在 `src/protocol/messages.ts#defaultLayout` 与 `src/webview/WorkbenchPanel.ts#DEFAULT_LAYOUT` 两处；`isWorkbenchLayout` 同时接受 tree/list。已持久化到 `workbench.layout` 的用户选择原样保留——默认值只定义「无持久化记录时」的行为；Tree/List 切换入口保留。
6. **Tree 目录链压缩**：`buildFileTree` 构建完逐层目录后，对「恰好只有 1 个子节点且该子节点是目录」的目录链做合并；合并节点的 `name` 用 ` / ` 连接各段（如 `src / main / java / com`），`path` 取链末端路径继续作为折叠 key。遇到文件子节点或出现第 2 个子节点立即停止，文件始终独立成行。
7. **压缩链的层级与缩进**：整条压缩链算 1 层，子节点 `depth + 1`；`FileTreeNodes` 的折叠键、chevron 与竖线引导线机制不变。合并后的长名称沿用 `.file-folder-name` 的 `min-width:0 + ellipsis`，并在目录按钮 `title` 给出完整路径。
8. **范围**：只改 Changed Files 的 Tree 视图；List 视图与 Branches 引用树（`buildRefTree` 的 slash 分组）均不变。

## 后果

- **收益：** 两面板视觉统一、与原生 TreeView 观感一致；默认 List 让文件清单一步可见，Tree 模式下深路径压缩减少连续展开操作。
- **代价 / 权衡：** 每次渲染全量重算折叠状态集合，树规模极大时需评估；移除 `min-width: max-content` 后超长文件名以省略号截断而非横向滚动；压缩后的目录名同样受 ellipsis 影响，需靠 `title` 补足可读性。
- **降级方向：** 压缩只影响目录节点的显示名与视觉层级，不改变 `ChangedFile` 路径、折叠 key 或右键目标；文件行与 List 视图不受影响。
- **未解决风险：** 极深路径（十余段）合并后单行仍会被省略；若后续需要按中间目录折叠，须重新评估压缩链的折叠 key 语义。
- **不做什么：** 新增树面板须复用 `RefTreeNodes`/`FileTreeNodes` 的受控折叠模式，并将 `--indent-guide-left` 定义在外层容器上——沿用既有约定，不另立实现。

## 实施位置

`webview/src/icons.tsx`（`ChevronRight`/`ChevronDown`）、`webview/src/RefsPane.tsx`、`webview/src/FilesPane.tsx#FileTreeNodes`（受控折叠 + `--indent-guide-left`）、`webview/src/styles.css`（`.file-tree-directory::before` 竖线、`.file-folder-name` 省略）。

- 视图默认值：`src/protocol/messages.ts#defaultLayout`、`src/webview/WorkbenchPanel.ts#DEFAULT_LAYOUT`。
- 目录树构建与压缩：`webview/src/buildFileTree.ts#buildFileTree`。
- 用例：`test/unit/fileTree.test.ts`。

## 验证

- `buildFileTree` 表驱动用例覆盖无目录 / 单链 / 链中分支 / 链末为文件 / 顶层并列目录；原有分组用例保持不变。
- 两处默认值定义由静态一致性用例锁定为 `list`；`npm run typecheck`、`npm run lint`（0 error）、`npm test` 71 文件 / 739 通过 / 5 跳过。

## 下一步

无需后续动作。
