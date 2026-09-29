# ADR-0022: 远程 tag 探测缓存

**状态：** 已接受
**创建时间：** 2026-09-28

> 当前状态 / 核心结论：远程 tag 探测（`getPushedTags`）的结果按仓库缓存，TTL 5 分钟；`push` / `pushTag` 成功后立即失效。避免每次 ref 加载都重跑 `ls-remote`（单 remote 约 3–9s）。

---

## 背景（1-3 句）

ADR-0019 让远程 tag 状态由 `getPushedTags` 异步补齐，但每次 ref 加载都会对每个 remote 重跑 `git ls-remote --tags`（实测单 remote 约 3–9s）。刷新、切换仓库等常规操作都会触发，网络开销被反复支付。

## 决策

1. **缓存位置与键**：`WorkbenchController` 按 `repositoryId` 缓存探测的原始结果 `Map<remote, tags[]>`（非富化后的 refs），与消费点 `enrichRefsWithPushedTags` 同处一地，便于失效。
2. **TTL**：`PUSHED_TAGS_CACHE_MS = 5 * 60_000`。窗口内直接复用上次探测、不再发起网络往返；窗口外重探，以界定外部（他人推送）变化的可见延迟。
3. **失效**：`push` / `pushTag` 成功后，清空该操作组内各仓库的缓存（push 可能携带 tag，取决于配置）；其余操作不改动 remote 的 tag 列表，缓存继续有效。
4. **不做什么**：不改探测的并发 / 超时 / 失败上报（仍由 `GitService.getPushedTags` 负责）；不为缓存引入手动刷新入口。

## 后果

- **收益：** 常规刷新、切换仓库不再重复付出 `ls-remote` 的网络开销；tag 的本地/远程标记立即可用。
- **代价 / 权衡：** 外部推送到 remote 的新 tag 最多 5 分钟才可见；本机 push 因立即失效而即时反映。
- **已知限制（继承 ADR-0019）：** 探测失败的 remote 被省略，其 tag 表现为"未推送"；缓存窗口内该状态同样保持。

## 验证

`test/unit/WorkbenchController.test.ts` 用例 "reuses a recent remote tag probe instead of probing again on the next load"：同一仓库连续两次 ref 加载，断言 `getPushedTags` 只被调用一次。

## 实施位置

`src/webview/WorkbenchController.ts`（`pushedTagsCache` 字段、`PUSHED_TAGS_CACHE_MS`、`PUSHED_TAGS_INVALIDATING_OPERATIONS`、`enrichRefsWithPushedTags`、操作完成处的失效）。

## 下一步

无需后续动作。

## 关联文档

- [ADR-0019: Tag 本地与远程区分标识](ADR-0019-Tag本地与远程区分标识.md) — 本 ADR 修订其 `getPushedTags` 的调用策略（加缓存）。
- [ADR-0023: Tag 目录默认折叠](ADR-0023-Tag目录默认折叠.md) — 缓存的 `pushedTo` 决定 remote 目录数量，进而决定默认折叠的目录集合。
