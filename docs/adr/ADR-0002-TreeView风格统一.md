# ADR-0002: Tree 面板统一为 VSCode 原生 TreeView 风格

**状态：** 已接受
**创建时间：** 2026-09-07

> 当前状态 / 核心结论：Branches 与 Changed Files 两个树面板已统一为「受控折叠 + 内联 SVG chevron + CSS 变量定位缩进竖线 + status 靠右」风格，与 VSCode 原生 TreeView 观感一致。无需后续动作。

---

## 背景（1-3 句）

两面板的树形展示此前缺乏统一视觉规范：Branches 用 Unicode 箭头（`›`/`⌄`）且叶节点有多余符号占位、无缩进引导线；Changed Files 依赖浏览器原生 `<details>`/`<summary>`，折叠箭头样式不可控、无竖线；两处缩进不一致，与 VSCode 原生观感不符。

## 决策

1. **折叠图标统一为内联 SVG chevron**：`icons.tsx` 导出 `ChevronRight`/`ChevronDown`（16×16）为公共资源，替代 Unicode 箭头与 `<summary>` 三角标记；仅当前分支 `HEAD` 保留 `●` 徽章，其余目录/叶节点图标与符号移除。
2. **受控折叠状态**：折叠由 React state（`Set<string>`）驱动，不再依赖 `<details>`；每面板维护独立折叠 state（Branches：`collapsedRefGroups`/`collapsedRefFolders`；Changed Files：`collapsedFileDirectories`）；折叠 key 用目录路径，保证跨渲染稳定。
3. **缩进竖线引导线**：每层缩进 14px；竖线由容器伪元素 `.ref-tree-directory::before`/`.file-tree-directory::before` 绘制，位置 = 容器 CSS 变量 `--indent-guide-left` + 8px（chevron 半宽），使竖线对准折叠图标中心。**关键约束**：`--indent-guide-left` 必须定义在**外层容器 div** 上而非内层 `<button>`——CSS 变量沿祖先链向上查找，定义在子元素时伪元素读不到会回退 `0px`、致所有竖线重叠最左。
4. **Changed Files status 靠右**：status（`A`/`M`/`D`/…）从行首移到行尾；行宽 `width: 100%`（配合 `box-sizing: border-box`），status 用 `margin-left: auto` 相对面板右对齐；`.file-path` 可收缩（`flex: 1 1 auto` + ellipsis），超长文件名省略以保持 status 可见；List 视图一并靠右。

## 后果

- **收益：** 两面板视觉统一、与原生 TreeView 观感一致；竖线引导线提升多层级可读性；受控折叠为未来「按仓库记忆折叠状态」的持久化奠定基础。
- **代价 / 权衡：** 每次渲染全量重算折叠状态集合，树规模极大时需评估；移除 `min-width: max-content` 后超长文件名以省略号截断而非横向滚动。
- **不做什么：** 新增树面板须复用 `RefTreeNodes`/`FileTreeNodes` 的受控折叠模式，并将 `--indent-guide-left` 定义在外层容器上——沿用既有约定，不另立实现。

## 实施位置

`webview/src/icons.tsx`（`ChevronRight`/`ChevronDown`）、`webview/src/RefsPane.tsx`、`webview/src/FilesPane.tsx`（受控折叠 + `--indent-guide-left`）、`webview/src/styles.css`（`.ref-tree-directory::before`/`.file-tree-directory::before` 竖线）。

## 下一步

无需后续动作。
