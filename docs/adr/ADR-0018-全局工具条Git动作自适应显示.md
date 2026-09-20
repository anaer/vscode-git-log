# ADR-0018: 全局工具条 Git 动作自适应显示

**状态：** 已接受
**创建时间：** 2026-09-20

> 当前状态 / 核心结论：Pull / Push / Force Push 不再固定在 More Git actions 菜单里——工具条按可用宽度自适应，放得下就直接显示为 SVG 图标按钮，放不下才收进 More 菜单；溢出按「右边优先」折叠。已实施并通过验证。

---

## 背景（1-3 句）

全局工具条右侧的 More Git actions 菜单固定收纳 Pull / Push / Force Push 三个高频动作，用户每次操作都要多点一次。files 面板折叠时工具条有较大可用宽度，这些动作完全可以直接显示为图标。

## 决策

1. **动作顺序固定为单一事实来源**：`GLOBAL_TOOLBAR_ACTIONS` 数组按既有顺序编排——Refresh、GoToHead、Fetch、Stashes、ToggleRefs、ToggleFiles、Pull、Push、ForcePush。
2. **自适应溢出按「右边优先」**：`globalToolbarMetrics(available)` 纯函数计算在给定内容宽度下能直接显示的动作数（每按钮 34px、间距 6px，More 按钮占 34+6px）；放不下的动作按从右往左的顺序进入 More 菜单。纯函数便于单测与后续复用。
3. **可用宽度来源**：files 面板展开时为 `filesWidth`；折叠时复用 files-collapsed 布局的空余列，工具条可用宽 = `viewport − refs 列宽 − (refs 展开时 1px 边框) − LOG_COLUMN_MIN_WIDTH(476px)`，确保工具条不与 filter-bar 重叠。`LOG_COLUMN_MIN_WIDTH`(476px) 是单一事实来源：既参与上面的可用宽计算，又同时作为 App 内联 grid 与 `.workspace-grid` 的 log 列最小宽。两处必须同源——若工具条按较小值预留、log 列按较大值约束，折叠态下工具条会压住 filter-bar。App 通过内部状态读取 `window.innerWidth` 驱动重算。
4. **宽度由 App 内联设 CSS 变量**：`--global-toolbar-width` 由 `globalToolbarMetrics.contentWidth` 写回，`.global-toolbar` 与 files-collapsed 下 `.filter-bar` 的 `margin-right` 共用同一变量，CSS 结构不改。`contentWidth` 须覆盖常驻的 More 按钮：只要存在溢入菜单的动作（More 按钮必渲染），即使 0 个动作直显也要预留其宽度（`TOOLBAR_ACTION_WIDTH`），否则窄窗折叠态下 34px 的 More 按钮会溢出 8px 容器并压住筛选栏。
5. **图标按钮语义与菜单一致**：Pull / Push / ForcePush 直接按钮沿用原菜单动作（`push` 无 upstream 时发 `publishBranch`，ForcePush 发 `push + forceWithLease`）；`operationState`（rebase/merge 中）/ bare / 无 currentBranch / 操作进行中时禁用。
6. **More 菜单内容动态化**：`ContextMenuState` toolbar 变体携带 `actions` 快照；菜单渲染未被直接显示的 `pull`/`push`/`forcePush`，并把 `toggleRefs`/`toggleFiles` 也收进菜单，以便极端窄宽下仍能切换面板。More 按钮不再因仅剩面板动作而禁用。

## 后果

- **收益：** 高频率 Git 动作在空间充足时直达，减少一次点击；files 折叠时三个动作全部直接可见；溢出行为可预期（右边优先）。
- **代价 / 权衡：** 按钮从「固定 6 个」变为「6 + 可变」，工具条宽度与布局需动态计算；`window.innerWidth` 读取在真实窗口缩放时会触发 App 重渲染（仅 resize 时，开销可忽略）；log 列最小宽取 476px，窄窗下该列更早触到收缩下限。
- **不做什么：** 不改既有 6 个图标的顺序与图标；不把 stashes/fetch 等动作改回菜单（溢出只影响新增的 3 个及面板切换）；不变更 GitOperationService 的确认文案。

## 实施位置

`webview/src/Toolbars.tsx`（`GLOBAL_TOOLBAR_ACTIONS`、`globalToolbarMetrics`、`GlobalToolbar` 重写）、`webview/src/App.tsx`（viewport 状态、metrics 派生、`ContextMenuState.toolbar.actions`、CSS 变量回写）、`webview/src/ContextMenu.tsx`（toolbar 菜单动态渲染 `toggleRefs`/`toggleFiles`/`pull`/`push`/`forcePush`）、`webview/src/icons.tsx`（Pull / Push / ForcePush 三个 16×16 SVG）。

## 下一步

无需后续动作。