# ADR-0002: Tree 面板统一为 VSCode 原生 TreeView 风格

**状态：** 已接受
**创建时间：** 2026-09-07
**更新时间：** 2026-09-07

**背景：**

Branches 面板与 Changed Files 面板的树形展示此前缺乏统一的视觉规范：
- Branches 分组/目录使用 Unicode 箭头（`›`/`⌄`）、叶节点前有多余的符号占位，无缩进引导线
- Changed Files 依赖浏览器原生 `<details>`/`<summary>` 折叠，折叠箭头样式不可控，无竖线引导线
- 两处缩进不一致、无层级竖线，与 VSCode 原生 TreeView 观感不符

**决策：**

将两个 Tree 面板统一为「受控折叠 + 内联 SVG chevron + CSS 变量定位的缩进竖线」风格：

### 1. 折叠展开图标统一为内联 SVG chevron
- 提取 `ChevronRight` / `ChevronDown` 两个 16×16 SVG 常量为公共资源
- 替代 Unicode 箭头与浏览器原生 `<summary>` 三角标记
- 仅当前分支 `HEAD` 保留 `●` 徽章；其余目录/叶节点图标与符号移除

### 2. 受控折叠状态
- 目录折叠状态由 React state（`Set<string>`）驱动，不再依赖浏览器原生 `<details>` 行为
- 每个面板维护独立的折叠 state（Branches：`collapsedRefGroups`/`collapsedRefFolders`；Changed Files：`collapsedFileDirectories`）
- 折叠 key 使用目录路径，保证跨渲染稳定

### 3. 缩进竖线引导线
- 每层缩进统一为 20px
- 竖线通过容器伪元素 `.ref-tree-directory::before` / `.file-tree-directory::before` 实现
- 竖线位置由 CSS 变量 `--indent-guide-left`（= 当前目录 paddingLeft）+ 8px（chevron 半宽）计算，使竖线对准折叠图标中心
- **关键实现细节**：`--indent-guide-left` 必须定义在**外层容器 div** 上而非内层 `<button>` 上——CSS 变量沿祖先链向上查找，定义在子元素上时伪元素读取不到，会回退为 `0px` 导致所有竖线重叠在最左侧

### 4. Changed Files status 靠右对齐
- status（`A`/`M`/`D`/…）从行首移到行尾
- 行宽改为 `width: 100%`（配合 `box-sizing: border-box`），status 用 `margin-left: auto` 相对**面板**右对齐
- `.file-path` 设为可收缩（`flex: 1 1 auto` + ellipsis），超长文件名省略以保持 status 可见
- List 视图同样受益，status 一并靠右

**后果：**

**优点：**
- 两面板视觉统一，与 VSCode 原生 TreeView 观感一致
- 竖线引导线提升多层级目录的可读性
- 受控折叠为未来状态持久化（按仓库记忆折叠状态）奠定基础

**缺点：**
- 每次渲染全量重算折叠状态集合，树规模极大时需评估
- Changed Files 移除 `min-width: max-content` 后，超长文件名通过省略号截断而非横向滚动

**迁移说明：**
1. 新增目录折叠逻辑需在新增 Tree 面板时复用 `RefTreeNodes`/`FileTreeNodes` 的受控折叠模式
2. 竖线实现依赖 CSS 变量作用域，新增目录容器时须将 `--indent-guide-left` 定义在外层容器上

**更新记录：**

| 日期 | 变更 |
|------|------|
| 2026-09-07 | 创建本 ADR，记录 Branches 与 Changed Files 面板统一为 TreeView 风格 |
