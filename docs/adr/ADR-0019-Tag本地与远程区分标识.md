# ADR-0019: Tag 本地与远程区分标识

**状态：** 已接受
**创建时间：** 2026-09-28

> 当前状态 / 核心结论：Branches 面板 Tags 组中，已推送到远程的 tag 在名称后显示远程名后缀（如 `v1.0 origin`），仅本地 tag 保持原样。一个 tag 若存在于多个远程，则全部列出。

---

## 背景（1-3 句）

当前 Tags 组中所有 tag 外观相同，用户无法区分哪些 tag 已推送到远程、哪些仅存在于本地。Remote branches 组已有 `origin/branch` 格式，tag 可复用相同模式。

## 决策

1. **两阶段加载**：`getRefs` 恢复为纯本地调用（`for-each-ref` + `git remote`），ref 列表立即可用；远程 tag 状态由独立的 `getPushedTags` 在其后异步补齐。这是本 ADR 的核心取舍：**ref 列表的正确性与时效性优先于远程标识的即时性**——`getRefs` 被 5 个调用方共用（Workbench 刷新、文件比较、文件/行历史编辑器），把网络往返放在其中任一路径上都会拖慢无关功能。
2. **数据来源**：`getPushedTags` 对**每一个**已配置 remote 单独执行 `git ls-remote --tags -- <remote>`，各 remote 并行查询，并按 `remoteNames` 顺序收集结果（否则 Map 顺序取决于探测完成先后，`pushedTo` 标签会在每次加载间抖动）。
3. **标记方式**：新增 `RefLabel.pushedTo: string[]`，列出携带该 tag 的全部 remote。不复用 `RefLabel.remote`——该字段对 tracking ref 表示"被跟踪自哪个 remote"，语义不同，混用会让 tag 与分支的归属互相污染。仅 `tag` kind 会被填充。
4. **UI 展示**：`RefsPane.tsx` 中 tag 行在 `pushedTo` 非空时显示远程名后缀，多个 remote 以空格分隔；搜索索引也包含 `pushedTo`。
5. **失败可见**：某个 remote 探测失败时，通过 `onDiagnostic` 向 Output 面板报告，并将其从结果中**省略**（而不是当作"该 remote 没有 tag"）。省略后该 tag 不会被标为已推送，从而不会把"探测失败"伪装成"仅本地"。
6. **超时封顶**：每个 remote 独立 `REMOTE_TAG_TIMEOUT_MS = 15_000`。该值经实测确定：对 GitHub HTTPS remote 单次 `ls-remote --tags` 在普通网络下波动于 ~2.9s–~9.4s，低秒级上限反而会命中常态路径而非异常路径。探测不在关键路径上（见决策 1），因此放宽上限对用户可感知时延没有代价——ref 列表早已渲染，探测在后台进行。
7. **失败只报告一次**：同一 remote 在一个会话内只输出一次诊断。慢 remote 每次加载都会被重新探测，若不抑制则同一行会反复写入 Output 面板、淹没真实诊断。首次报告承载信息，重复无新增价值。措辞明确"ref 列表不受影响"，避免把"远程标签未标注"读成"ref 数据有误"。
8. **无 tag 不探测**：本地 ref 列表里没有 tag 时直接跳过探测。此时没有可标注的对象，发起网络往返只是在问一个没人问的问题，同时避免探测进程在面板关闭后仍滞留。
9. **探测随面板终止**：`dispose()` 中一并 abort 未完成的探测，不让后台 `ls-remote` 在面板关闭后继续运行。

## 后果

- **收益：** ref 列表的加载路径重新变回纯本地，Workbench 打开速度与本功能引入前一致；远程 tag 在探测完成后自动补上，用户无需手动刷新。
- **代价 / 权衡：** tag 后缀存在"先无后有"的短暂窗口；需要一条新的 `pushedTagsLoaded` 通道与一处竞态守卫。
- **竞态守卫**：补齐结果按 `repositoryId` + `logRequestSequence` 双重校验，仓库已切换或日志已刷新时直接丢弃，防止旧探测结果覆盖新状态。
- **已知限制：** 探测失败与"确实仅本地"在 UI 上都表现为无后缀，区别只在 Output 面板有诊断日志。
- **不做什么：** 不改变 tag 的右键菜单操作；不显示 ahead/behind 计数（tag 无 tracking 概念）；不比较本地与远程 tag 的目标 commit——判定依据是 remote 是否**通告同名 tag**；编辑器侧的 ref 选择器（文件/行历史、比较）不展示远程标识，故不受两阶段影响。

## 实施位置

`src/git/GitService.ts`（`getRefs` 本地化 / `getPushedTags` 异步探测）、`src/git/parsers/parseRefs.ts`（`withPushedTags` 富化）、`src/protocol/messages.ts`（`pushedTagsLoaded`）、`src/webview/WorkbenchController.ts`（两阶段编排与守卫）、`webview/src/workbenchMessageProcessing.ts`（合并补齐结果）、`webview/src/RefsPane.tsx`（tag 行显示远程名）。
