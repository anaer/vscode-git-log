# ADR-0003: App.tsx God Component 拆分（Zustand + 渐近式）

**状态：** Accepted
**创建时间：** 2026-09-07
**更新时间：** 2026-09-07

**结论：** 对 4300 行的 `webview/src/App.tsx` 采用「Zustand 外部 store + 渐近式拆分」重构。对外契约保持不变（App 无 props），按 4 轮渐近拆分，每轮独立交付且测试保持绿。

**下一步：** 第 2 轮：拆分 refs pane、files pane、details pane、toolbars 为面板组件。

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
- 巨型 workbench state 仍是后续轮次的耦合核心，Zustand 迁移顺序需谨慎
- context menu 700 行 JSX 是第 1 轮最大迁移块 —— 已迁移完成

**第 1 轮交付（2026-09-07）：**
- 新建 `ContextMenu.tsx`（约 700 行菜单 JSX 迁入，5 种 kind，props 注入 ~25 项）
- 新建 `Dialogs.tsx`（stash/amend/squash/namedOperation/historyParentPicker 5 个对话框）
- 新建 `webviewUtils.ts`（`requestId` + `contextMenuPosition` 从 App 迁出）
- `App.tsx` 由 4301 行降至约 3270 行，导出 6 个组件私有 state 类型
- ref props 以 `Ref` 结尾命名，规避 eslint react-hooks/immutability 误报
- 验收：tsc/eslint 0 error，67 个 webview 测试全绿，`npm run build` 成功
- 教训：PowerShell 文本替换会破坏 UTF-8 非 ASCII 字符（`…` 变 `鈥?`），需用 Python 或 write 工具处理

**更新记录：**

| 日期 | 变更 |
|------|------|
| 2026-09-07 | 创建本 ADR，确定 Zustand + 渐近式拆分方案 |
| 2026-09-07 | 第 1 轮完成：拆分 5 对话框 + context menu，构建与测试保持绿；下一步进入第 2 轮面板化 |