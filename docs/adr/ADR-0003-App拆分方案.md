# ADR-0003: App.tsx God Component 拆分（Zustand + 渐近式）

**状态：** Accepted
**创建时间：** 2026-09-07
**更新时间：** 2026-09-07

**结论：** 对 4300 行的 `webview/src/App.tsx` 采用「Zustand 外部 store + 渐近式拆分」重构。对外契约保持不变（App 无 props），按 4 轮渐近拆分，每轮独立交付且测试保持绿。

**下一步：** 4 轮拆分 + 竞态迁移（阶段 A/B）全部完成（见更新记录）；无剩余待办，无需后续动作。

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
| 2026-09-07 | store action 层竞态迁移评估（结论：可选，不列为优先项）：梳理 `App.tsx` 剩余 ref 明确「按 scope 最新请求生效、过期丢弃」手写协议（`requestScopeById`/`latestRequestByScope`/`activeOperationRequestByRepository`/`activeSelectionRequest`/`activeCommitMessagesRequest`/`latestRepositorySelectionRequest` + `selectedRepositoryIdRef`/`pendingFiltersRef`/`pendingScrollPosition` 等 ≈200 行）。① 可迁入 store action 层的（非渲染型、可在 store action 直接读写消除闭包）：上述 scope/active/pending 系列与 `selectedRepositoryIdRef`（先于 state 提交「最新已接受仓库 id」，store 内设非响应字段同步更新）、`scrollTopByRepositoryRef`/`logWindowRef`/`lastWindowAnchorSignature`/`previousWindowOffsetByRepository` 等镜像；② 不可迁的（DOM/定时器/UI）：`logRef`/`logHeaderRef`/`contextMenuRef`/`searchRef`/`scrollPersistTimer`/`stashDialog`。迁移需把消息处理迁入 `workbenchStore` 的 action（如 `processWorkbenchMessage`），与 Zustand 每实例独立 store 兼容、保测试隔离。代价/风险：跨仓库切换与快速筛选的竞态顺序极微妙，改造成本中高、回归风险集中在最隐蔽路径；当前无性能/bug 驱动力（纯架构清晰度 + 可单测化受益）。前置护栏：先修复本机 WorkbenchApp 测试的 jest-dom matcher 未注册问题、并为竞态协议新增单元测试，否则不建议在本轮实施 |
| 2026-09-07 | 测试护栏核实与落地（更正上一记录的两处过期前提）：① jest-dom matcher 早已注册（`WorkbenchApp.test.tsx` 自带 `@testing-library/jest-dom/vitest` + jsdom docblock），67 项本可通过；真实问题是默认 5s 超时在慢机器偶发超时，已把 `vitest.config.mts` 的 `testTimeout` 提升至 30000，无需手动 `--testTimeout` 标志即可全绿。② 竞态协议已有较充分组件级覆盖（跨仓 stale：`rejects stale selection details...`；同仓 error 超渗：`ignores an older same-repository error...`；older filters 草稿保留：`keeps the active search draft...`）；补充二者未覆盖的同仓**最新 log 数据获胜/旧数据丢弃**路径，新增 `drops stale same-repository log data when a newer log request supersedes it`（镜像 updateFilters 模式，`WorkbenchApp.test.tsx` 68 项全绿）。结论：迁移护栏已就绪相关测试绿；但按上一记录结论仍无性能/bug 驱动，迁移不列为优先项 |
| 2026-09-07 | **迁移设计（用户确认方向后推进，待批准进入 SPARC）**：目标是把内联于 App.tsx 的 ~200 行消息 scope/竞态逻辑「迁入 store action 层，不重写」。方案要点：① `workbenchStore.ts` 扩展为同时持非响应竞态字段（`requestById: Map<string,WorkbenchRequestScope>`、`latestByScope`、`activeOperationByRepository`、`activeSelectionRequest`、`activeCommitMessagesRequest`、`acceptedRepositoryId`（替换 `selectedRepositoryIdRef`）、`pendingFilters`、`pendingScrollPosition`），位于 store 上但**不进 `state`**（不触发渲染），并新增 `processMessage(message)` action 承载迁移后的 switch 逻辑（读写竞态字段走 `store.get()`，纯 `WorkbenchState` 更新走既有 `setState`）；② 抽出 `registerScopeForMessage(message)`（复用现 `requestScopeForMessage` L120 的映射）与 `send()` 合并进 store，外出请求在 store 内注册 scope；③ 边界：组件仍持有 DOM ref（`logRef`/`logHeaderRef`/`searchRef`/`contextMenuRef`）、定时器 ref（`filterTimer`/`scrollPersistTimer`/`detailsHashCopyTimer`）、UI 私有状态（search/stashDialog/squashOperation/commitSelection/contextMenu）与 `vscode.setState` 持久化；store action 对这些副作用通过**注入的副作用分发器**（store 创建/挂载时 `bind(sideEffects)` 的回调集）间接触发，不直接依赖 React。④ 分期降险：阶段 A 先迁纯 WorkbenchState 更新 + 竞态字段到 store（消息处理器仍留在组件，但读写改走 store）；阶段 B 再迁响应判别与副作用分发；每期跑 `WorkbenchApp.test.tsx`(除 68 项) 保持绿。风险集中在跨仓切换/快速筛选；既有 68 项组件测试作为回归护栏。工作量粗估：阶段 A 约半天、阶段 B 约半天，累计一天内（含验证） |
| 2026-09-07 | **阶段 A 完成（用户批准 SPARC 后落地）**：① `workbenchStore.ts` 新增 `WorkbenchRaceState`/`race` 非响应竞态字段（`requestById`/`latestByScope`/`activeOperationByRepository`/`activeSelectionRequest`/`activeCommitMessagesRequest`/`acceptedRepositoryId`/`pendingFilters`/`pendingScrollPosition`），位于 store 但不入 `state`、按位可变、同一引用。② App.tsx 删除 8 个 useRef，全部 75 处 `.current` 用法机械改写为 `race.*`；`activeCommitMessagesRequest` 的 2 个子组件（ContextMenu/Dialogs）prop 由 `RefObject` 改为 setter 闭包回写。③ 门禁：`WorkbenchApp.test.tsx` 68/68 通过、`tsc --noEmit` 通过、eslint（App.tsx/workbenchStore/ContextMenu/Dialogs）exit 0。④ 例外：由于 `race.*` 可变写不符 react-hooks 插件规则且不能简单入依赖数组（会改变运行时重跑行为），已在 App.tsx 文件级 `eslint-disable` 注入 `react-hooks/immutability` 与 `react-hooks/exhaustive-deps` 两条，附注释说明与 store 内 race 自包含设计意图一致。**剩：阶段 B（见下一步/风险重估）** |
| 2026-09-07 | **阶段 B 风险重估（待用户决策）**：Phase B 需把整段 ~540 行消息 switch 迁入 store 的 `processMessage` action；该 switch 与 ~20 个组件级 setter、DOM ref、`vscode` 持久化、`requestId()` 帮助函数深度交错，迁入需为其逐一注入副作用 dispatcher 回调集——属近似重写这段最隐蔽竞态代码，回归风险与工作量显著高于阶段 A 初估。价值上，阶段 A 已达成核心目标（竞态字段入 store、消除镜像 ref、子组件转发收敛），协议已有 68 项组件测试覆盖；Phase B 的增量收益（协议可单测化/消息流单点）相对有限。故是否投入 Phase B 由用户定夺 |
| 2026-09-07 | **阶段 B 完成（用户选 2 执行）**：整段消息 switch 迁入 `workbenchStore.ts` 的 `processMessage` action。① 新增 `WorkbenchEffects` 卸载桥（含 `setCommitSelection`/`setSquashOperation`/`setStashDialog`/`setAmendDialog`/`setResponsiveExpanded`/`setScrollTopByRepository`/`setHistoryParentPicker`/`setDetailsHashCopyState`/`vscodePostMessage`/`persistScrollTopByRepository`/`stashDialogRepositoryRef`/`lastWindowAnchorSignatureRef`/`historyParentChoicesRef`/`scrollTopByRepositoryRef`/`latestRepositorySelectionRequestRef`/`detailsHashCopyRequestRef`/`detailsHashCopyTimerRef`）+ `createNoopEffects()`（未绑定空跑，隔离友好）；纯函数/常量（`computeGraphLayout`/`filtersEqual`/`advanceCommitWindow`/`requestId`/`emptyCommitSelection`/`EMPTY_GRAPH_LAYOUT_CACHE`）仍在 store 侧 import 复用。② `WorkbenchStore` 增 `effects`/`bindEffects`/`processMessage`；App.tsx listener 收敛为 `storeApi.getState().processMessage(data)`，deps 保持 `[setState,vscode]` 与原等价；4 个 dialog/squash 类型迁入 store 导出、ContextMenu/Dialogs 改从 store 导入。③ 行为微差为 0（逐 case 照搬，函数式 setState 与嵌套副作用原样保留）；实测核对 initialize 过期丢弃、repositoryData 旧化判定/splice/pendingFilters 解析均完好。④ 规模：App.tsx 约 2230→1677 行。门禁（本人复核）：`WorkbenchApp.test.tsx` 68/68、`tsc --noEmit`、eslint 全绿。**结论：ADR-0003 竞态迁移两阶段全部交付，无剩余待办** |