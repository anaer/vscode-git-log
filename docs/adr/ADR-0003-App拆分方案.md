# ADR-0003: App.tsx God Component 拆分（Zustand + 渐近式）

**状态：** 已接受
**创建时间：** 2026-09-07

> 当前状态 / 核心结论：对约 4300 行的 `webview/src/App.tsx` 采用「Zustand 每实例独立 store + 渐近式拆分 + 竞态逻辑原样迁入 store action」重构，全部落地（4 轮拆分 + 竞态迁移阶段 A/B），对外契约冻结不变。无需后续动作。

---

## 背景（1-3 句）

`App()` 是典型 God Component：23 个 useState（含巨型 `WorkbenchState`）、22 个 useRef（其中 20+ 个是 state 同步镜像，用于绕闭包让异步回调读最新值）、约 200 行手写消息 scope/竞态去重逻辑。ADR-0001 提出拆分但未定技术路线，本篇定路线并实施。

## 决策

1. **状态管理选型 Zustand 外部 store**：store 在组件外读取，直接消除镜像 ref；~1KB 体积可接受。每渲染实例持独立 store + Context（非模块单例），天然隔离测试状态、无需 reset；`storeApi.getState()` 为非 hook 读取入口。
2. **渐近式多轮拆分，每轮独立可交付**：先剥私有 state 最易切分的对话框 + context menu，再面板化（refs/files/details/toolbars），再迁共享 state 入 store，最后提炼选择状态机、消除纯镜像 ref。
3. **竞态逻辑迁入 store action 层、不重写**：消息 scope/竞态去重（`requestScopeById`/`latestRequestByScope`/`active*` 等约 200 行）以**逐 case 照搬**方式迁入 `workbenchStore` 的 `processMessage` action——非响应竞态字段置于 store 但不入 `state`（不触发渲染），组件仍持 DOM/定时器/UI 私有 ref，经注入的副作用分发器（`bindEffects`）间接触发，store 不直接依赖 React。
4. **对外契约冻结**：`App` 保持无 props 顶层壳，`index.tsx` 与 `WorkbenchApp.test.tsx` 两消费端零改动；拆分后 ulog、postMessage 结构、DOM label 不变。
- **不做什么：** 不引入状态管理新范式、不改数据流语义；行为微差为 0。

## 后果

- **收益：** 约 4300 行缩减至约 1800 行、各面板 <500 行；消除 20+ 镜像 ref，重渲染范围缩小；竞态字段入 store、可单测化。
- **代价 / 权衡：** 新增 zustand 依赖（随 webview 打包 +1KB）；跨文件重构，每轮需构建 + webview 测试保持绿；`race.*` 可变写不符 react-hooks 插件规则，App.tsx 对 `react-hooks/immutability`/`exhaustive-deps` 两条做文件级 `eslint-disable` 并注释说明。
- **未解决风险：** `selectedRepositoryIdRef` 承担「最新已接受仓库 id」竞态语义，按决策 3 原样保留（非纯镜像 ref），未消除。

## 实施位置

- 拆出组件：`webview/src/ContextMenu.tsx`、`Dialogs.tsx`、`RefsPane.tsx`、`FilesPane.tsx`、`DetailsPane.tsx`、`Toolbars.tsx`、`icons.tsx`、`webviewUtils.ts`。
- 状态与竞态：`webview/src/workbenchStore.ts`（`WorkbenchState` + `race: WorkbenchRaceState` 非响应字段 + `processMessage`/`bindEffects` + `createWorkbenchStore`/`WorkbenchStoreContext`/`useWorkbenchState` 等 hook）。
- 选择状态机：`webview/src/commitSelection.ts`（`nextCommitSelection()`/`isContiguousSelection()`），并消除 `commitSelectionAnchor` 镜像 ref。
- App 侧：`webview/src/App.tsx` 拆为 `App`（Provider 壳）+ `Workbench`（主体），listener 收敛为 `storeApi.getState().processMessage(data)`。

## 验证

`WorkbenchApp.test.tsx` 71 项、`commitSelection.test.ts` 9 项全绿；`tsc --noEmit` 通过；相关文件 eslint exit 0。

## 关联文档

- ADR-0001（提出拆分需求，本篇定技术路线并实施）；ADR-0002（`icons.tsx` 的 Chevron SVG 公共化落实其决策）。

## 下一步

无需后续动作。
