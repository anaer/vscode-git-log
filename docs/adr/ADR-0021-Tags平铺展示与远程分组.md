# ADR-0021: Tags 平铺展示与远程分组

**状态：** 已接受
**创建时间：** 2026-09-28

> 当前状态 / 核心结论：Branches 面板 Tags 组把**所有 tag 平铺在根下**（含已推送的，不隐藏进子目录）；已推送 tag 额外再归入各自 remote 目录（推送到多个 remote 则各列一份）；**remote 目录节点先于根下平铺列表渲染**；仅本地未推送的 tag 在行尾**靠右**显示 `*` 标记。

---

## 背景（1-3 句）

ADR-0019 为区分 tag 的本地/远程归属，在 tag 名后追加远程名后缀（如 `v1.0 origin`）。后缀与名称混排、远程多时更拥挤；而把已推送 tag 只放进 remote 子目录，又会让根下看不到全部 tag。

## 决策

1. **根下平铺全部**：Tags 根下列出所有 tag（含已推送的），`buildRefTree` 对 `tag` kind 按 tag 名中的 `/` 拆分目录（与分支一致），不因推送状态隐藏任何 tag。
2. **已推送再归目录**：`ref.pushedTo` 非空的 tag，额外在**每个**通告它的 remote 目录下再列一份（多 remote 则各列一份）；**remote 目录节点排在根下平铺列表之前**（先目录、后平铺叶）。
3. **本地标记**：无任何已探测 remote 通告的 tag（`ref.pushedTo` 为空或未设置），在 tag 名后**靠右**显示 `*`（`.tag-local`，`margin-left: auto`）；已推送 tag 不显示标记。
4. **目录默认折叠**：tag 目录节点（remote 根如 `origin`、以及 tag 命名空间如 `release`）默认折叠，见 [ADR-0023](ADR-0023-Tag目录默认折叠.md)。
5. **不做什么**：不改 `pushedTo` 的数据来源与探测时序（仍由 ADR-0019 的异步 `getPushedTags` 提供）；不恢复远程名后缀。

## 后果

- **收益：** 根下一屏可见全部 tag、不藏进子目录；同时保留按 remote 归组的视图；本地/远程区分靠行尾单个 `*`，不挤压 tag 名。
- **代价 / 权衡：** 已推送 tag 会在根下与 remote 目录下各出现一次（同一 ref 两处渲染，`title` 同值重复）。
- **已知限制（继承 ADR-0019）：** `pushedTo` 未设置既表示"确实仅本地"，也表示"探测失败 / 无可达 remote"——两者在 UI 上都表现为行尾 `*`，区别只在 Output 面板的诊断日志。

## 实施位置

`webview/src/buildRefTree.ts`（`buildRefTree` 的 tag 分支：先按 remote 插入目录节点、再在根下平铺全部 tag；另导出 `collectRefFolderKeys` 供目录键推导）、`webview/src/RefsPane.tsx`（tag 行尾 `*` 标记）、`webview/src/styles.css`（`.tag-local` 靠右，取代 `.tag-remote`）。

## 下一步

无需后续动作。

## 关联文档

- [ADR-0019: Tag 本地与远程区分标识](ADR-0019-Tag本地与远程区分标识.md) — `pushedTo` 数据来源；其"远程名后缀"展示决策由本 ADR 取代。
- [ADR-0023: Tag 目录默认折叠](ADR-0023-Tag目录默认折叠.md) — tag 目录节点的初始折叠状态。
