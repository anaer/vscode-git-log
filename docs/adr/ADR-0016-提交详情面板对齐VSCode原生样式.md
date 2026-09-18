# ADR-0016: 提交详情面板对齐 VSCode 原生样式

**状态：** 已接受
**创建时间：** 2026-09-18

> 当前状态 / 核心结论：提交详情面板（底部 DetailsPane）8 处样式已由自定义观感收敛为 VSCode 原生风格（badge 去胶囊、按钮透明边框 + 主题圆角、hash 等宽前景色、标题/字号走主题变量、label 与值分离着色、空状态对齐）。已实施并通过验证。无需后续动作。

---

## 背景（1-3 句）

底部提交详情面板此前自定义观感偏重：refs 用胶囊徽章、meta 按钮常显边框、hash 用链接色误导点击、标题与字号硬编码，未跟随主题变量，与 VSCode 原生观感不一致。

## 决策

1. **refs 徽章去胶囊化**：`.details-refs > span` 由 `border-radius: 8px` + 边框改为无边框、`border-radius: 2px`，底色沿用 `--vscode-badge-background/foreground`，贴近原生 badge（方形微圆角）。
2. **meta 按钮对齐原生 secondary 按钮**：`.details-meta button` 改 `border: 1px solid transparent`（hover 显现边框），`border-radius: var(--vscode-button-borderRadius, 2px)`，颜色沿用 `--vscode-button-secondaryBackground/Foreground`。
3. **hash 等宽前景色**：`.details-meta code` 由链接色 `--vscode-textLink-foreground` 改为 `--vscode-textPreformat-foreground`（等宽文字色），避免被误判为可点击链接；父提交 hash 按钮保持链接色（本就是可点击）。
4. **标题字号/字重走主题变量**：`.details-message` 由 `font-size: 14px; font-weight: 600` 改为 `font-size: var(--vscode-font-size)` + `font-weight: var(--vscode-font-weight, 600)`，跟随用户 UI 字号。
5. **面板内边距收敛**：`.details-pane` 由 `padding: 12px 15px` 改为 `var(--vscode-panel-padding, 10px 12px)`。
6. **meta 行字号跟随主题**：`.details-meta` 由 `font-size: 12px` 改为继承主题字号（移除硬编码）。
7. **label 与值分离着色**：`DetailsPane.tsx` 元数据行中 `Author:`/`Authored:`/`Committer:`/`Committed:`/`Parents:`/`Refs:`/`Signature:` 等 label 用 `.details-meta-label` 包裹，以 `--vscode-descriptionForeground` 弱化，值与 label 同色分离，提升扫读性。
8. **空状态对齐原生**：`.details-placeholder` 加 `--vscode-descriptionForeground` 弱化 + 与标题留白，居中留白对齐 VSCode 空状态。

## 后果

- **收益：** 详情面板观感与 VSCode 原生一致；字号/圆角/内边距跟随主题变量，适配用户自定义 UI 缩放与高对比度主题。
- **代价 / 权衡：** refs 徽章由胶囊变方形，视觉辨识度略降；按钮默认无边框后，与周围文字区分度依赖背景色，hover 才有边框反馈。
- **不做什么：** 不改详情面板布局结构与交互（resizer、placement 按钮、滚动容器），仅调视觉层；file-type 图标色与警告 fallback 色不在本次范围。

## 实施位置

`webview/src/DetailsPane.tsx`（第 7 项 label 分离）、`webview/src/styles.css`（`.details-refs > span`、`.details-meta button`、`.details-meta code`、`.details-message`、`.details-pane`、`.details-meta`、`.details-placeholder`）。

## 下一步

无需后续动作。
