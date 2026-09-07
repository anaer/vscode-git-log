# ADR-0003: App.tsx God Component 拆分（Zustand + 渐近式）

**状态：** Accepted
**创建时间：** 2026-09-07
**更新时间：** 2026-09-07

**结论：** 对 4300 行的 `webview/src/App.tsx` 采用「Zustand 外部 store + 渐近式拆分」重构。对外契约保持不变（App 无 props），按 4 轮渐近拆分，每轮独立交付且测试保持绿。

**下一步：** 4 轮拆分已全部完成（见更新记录）。后续可评估：将 `selectedRepositoryIdRef`（承担竞态语义，按本 ADR 决策 3 原样保留）与 `pending*`/`active*` 系列 ref 的竞态逻辑一并迁入 store action 层。

**背景：**

`App()`（448–4301）是典型 God Component：23 个 useState（含巨型 `WorkbenchState`）、22 个 useRef（其中 20+ 个是 state 同步镜像，用于绕闭包让异步回调读最新值）、200 行手写消息 scope/竞态去重逻辑。ADR-0001 曾提出拆分但未定技术路线。

**决策：**

1. **状态管理选型：Zustand 外部 store** — 外部 store 在组件外读取，直接消除镜像 ref（估值可删 20+ 个 ref）；~1KB 体积可接受。
2. **渐近式拆分 4 轮**，每轮独立可交付：
   - 第 1 轮：5 个对话框（stash/amend/squash/namedOperation/historyParentPicker）+ context menu — 均为私有 state，最易切分
   - 第 2 轮：refs pane、files pane、details pane、toolbars — 面板化组件
   - 第 3 轮：把共享 state 抽入 Zustand store
   - 第 4 轮：消除镜像 ref，提炼选择状态机
3. **不动手写竞态逻辑**：消息 scope/竞态去重（`requestScopeById`/`latestRequestByScope` 等约 200 行）原样保留，作为 store action 层迁移，不重写。
4. **对外契约冻结**：`App` 保持无 props 顶层壳，`index.tsx` 与 `WorkbenchApp.test.tsx` 两消费端零改动。拆分后 ulog、postMessage 结构、DOM label 不变。

**后果：**

**收益：**
- 代码可维护性提升，4300 行缩减至各面板 <500 行
- 消除 20+ 镜像 ref，重渲染范围缩小
- 测试逐步迁移仍覆盖行为

**代价：**
- 新增 zustand 依赖
- 拆分是跨文件重构，每轮需构建 + 67 个 webview 测试保持绿

**迁移说明（编号）：**
1. 每轮先确认模块边界与 props 契约，再剪切代码
2. 每轮完成必须运行 `npm run build` + `npx vitest run test/unit/WorkbenchApp.test.tsx`
3. 竞态逻辑本轮（第 1 轮）不迁移，先随对话框/context menu 剥离纯渲染

**未解决风险：**
- context menu 700 行 JSX 是第 1 轮最大迁移块 —— 已迁移完成
- 巨型 `WorkbenchState` 已在第 3 轮迁入 Zustand store（`workbenchStore.ts`），`selectedRepositoryIdRef`（承担竞态语义，按本 ADR 决策 3 原样保留）与 `pending*`/`active*` 系列 ref 暂不迁移
- 本机 Windows 基线存在 70 个扩展端测试失败（`file:///repo` 的 `ERR_INVALID_FILE_URL_PATH`，见 FileComparisonEditor/FileHistoryEditor/GitOperationService 等），与 webview 拆分无关，需单独处理

**第 1 轮交付（2026-09-07）：**
- 新建 `ContextMenu.tsx`（约 700 行菜单 JSX 迁入，5 种 kind，props 注入 ~25 项）
- 新建 `Dialogs.tsx`（stash/amend/squash/namedOperation/historyParentPicker 5 个对话框）
- 新建 `webviewUtils.ts`（`requestId` + `contextMenuPosition` 从 App 迁出）
- `App.tsx` 由 4301 行降至约 3270 行，导出 6 个组件私有 state 类型
- ref props 以 `Ref` 结尾命名，规避 eslint react-hooks/immutability 误报
- 验收：tsc/eslint 0 error，67 个 webview 测试全绿，`npm run build` 成功
- 教训：PowerShell 文本替换会破坏 UTF-8 非 ASCII 字符（`…` 变 `鈥?`），需用 Python 或 write 工具处理

**第 2 轮交付（2026-09-07）：**
- 新建 `RefsPane.tsx`（refs 面板 + resizer，含受控折叠与 HEAD 徽章）
- 新建 `FilesPane.tsx`（files resizer + 面板，自带 `collapsedFileDirectories` state，`detailsContent` slot 承载 details 内嵌布局）
- 新建 `DetailsPane.tsx`（details resizer + 面板；`CommitDetailsResizer`/`CommitDetailsPane`/`DetailsPlacementButton` 三个私有子组件）
- 新建 `Toolbars.tsx`（`CommitToolbar` 过滤器栏 + `GlobalToolbar` 全局工具栏，导出 `FilterPopupKind` 供 App 复用）
- 新建 `icons.tsx`（`ChevronRight`/`ChevronDown` 公共 SVG，落实 ADR-0002）
- `App.tsx` 由 3270 行降至 2332 行（本轮 −938 行），仅保留消息/竞态逻辑与共享回调
- 修复抽取组件的两处缺陷：`DetailsPane` 中 `<{authorEmail}>` 裸尖括号会被当成 JSX 元素（须用 `&lt;`/`&gt;`）；cherry-pick/revert 丢失 `detailsRepositoryId`
- 验收：tsc 0 error、eslint 0 error、67 个 webview 测试全绿、`npm run build` 成功
- 教训：eslint `react-hooks/purity` 禁止在渲染期调用 `Date.now()`，日期预设的计算必须留在 `onClick` 内联；抽取面板时把「数据 + 语义回调」作为 props 边界，避免把整个 `state` 透传

**第 3 轮交付（2026-09-07）：**
- 安装 `zustand@5.0.15`（加入 `dependencies`，随 webview 打包，bundle +1KB 符合预期）
- 新建 `workbenchStore.ts`：持有 `WorkbenchState`、导出 `defaultLayout`/`defaultFilters`/`initialWorkbenchState`、创建工厂 `createWorkbenchStore()` 与 `WorkbenchStoreContext`，并提供 `useWorkbenchState()` / `useSetWorkbenchState()` / `useWorkbenchStoreApi()` 三个 hook
- `App.tsx` 拆为 `App`（Provider 壳，保持无 props 契约）+ `Workbench`（主体），每个渲染实例持独立 store，天然隔离测试状态，无需 reset
- `WorkbenchState` 接口与 `initialState` 从 App 迁出；`App.tsx` 由 2332 行降至 2250 行
- 关键设计：store 用 `createStore` + Context，而非模块单例——避免 `WorkbenchApp.test.tsx` 多次渲染间状态串味；`storeApi.getState()` 为第 4 轮消 ref 提供非 hook 读取入口
- 验收：tsc 0 error、eslint 0 error（仅 2 个 exhaustive-deps 警告，已把稳定引用 `setState` 补入依赖数组）、67 个 webview 测试全绿、`npm run build` 成功

**第 4 轮交付（2026-09-07）：**
- 新建 `commitSelection.ts`：抽出选择状态机纯函数 `nextCommitSelection()`（toggle/extend/单选三种模式，返回 `selection` + `focusedHash`，toggle 删除最后一个时返回 `undefined` 表示 no-op）、`isContiguousSelection()`、类型 `CommitSelection`/`CommitSelectionResult`/`emptyCommitSelection`
- `App.tsx` 中 `selectedCommitHashes`（useState）+ `commitSelectionAnchor`（useRef）合并为单一 `commitSelection` state，删除 `commitSelectionAnchor` 这个镜像 ref——这正是 ADR 第 4 轮要消除的镜像 ref 之一
- `hasContiguousCommitRange` 改用 `isContiguousSelection` 纯函数；5 处消息同步点的 `anchor`/`hashes` 赋值统一收敛为 `setCommitSelection(...)`
- 语义保持：原 `selectCommit` 各分支（history 模式早退、toggle 删除聚焦剩余项、extend 越界回退单选、单选移动 anchor）逐项对照验证一致
- 新增 `test/unit/commitSelection.test.ts`（9 个用例）覆盖纯函数；总体 `App.tsx` 降至约 2230 行
- 未消除的镜像 ref：`selectedRepositoryIdRef` 实际承担「最新已接受仓库 id」竞态语义（早于 state 写入），按本 ADR 决策 3「竞态逻辑原样保留」予以保留，故第 4 轮实际是「提炼选择状态机 + 消除一个纯镜像 ref」，而非当初预估的「20+ 镜像 ref」
- 验收：tsc 0 error、eslint 0 error、webview 67 + commitSelection 9 测试全绿、`npm run build` 成功

**更新记录：**

| 日期 | 变更 |
|------|------|
| 2026-09-07 | 创建本 ADR，确定 Zustand + 渐近式拆分方案 |
| 2026-09-07 | 第 1 轮完成：拆分 5 对话框 + context menu，构建与测试保持绿；下一步进入第 2 轮面板化 |
| 2026-09-07 | 第 2 轮完成：refs/files/details 三个面板 + 两个 toolbar 组件化，`App.tsx` 3270→2332 行；下一步进入第 3 轮 Zustand store 迁移 |
| 2026-09-07 | 第 3 轮完成：`WorkbenchState` 迁入 Zustand store（每实例独立 store + Context），`App.tsx` 2332→2250 行；下一步进入第 4 轮选择状态机/消 ref |
| 2026-09-07 | 第 4 轮完成：抽出 `commitSelection.ts` 状态机 + 消除 `commitSelectionAnchor` 镜像 ref，`App.tsx` 约 2230 行；4 轮拆分全部交付 |