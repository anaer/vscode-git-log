# ADR-0020: Tag 删除操作未执行 Git 命令

**状态：** 已接受
**创建时间：** 2026-09-28

> 当前状态 / 核心结论：通过右键菜单删除 tag 后，前端 UI 中 tag 消失，但 `git tag -l` 显示 tag 仍然存在。根因是 `deleteTag` 操作在 `buildOperationArguments` 中被错误地映射为创建 tag 的命令。

---

## 背景（1-3 句）

用户通过右键菜单删除 tag 后，Tags 列表中该 tag 消失，但 `git tag -l` 确认本地 tag 仍然存在。重新加载后 tag 再次出现。

## 决策

1. **根因**：`GitOperationService.ts#buildOperationArguments` 的 `deleteTag` case 返回的是**创建** tag 的指令（缺少 `-d` 删除参数），而非删除指令。具体表现为 `tag` 之后直接跟 tag 名、没有 `-d`，git 会把它当作"创建/更新该 tag"处理。于是 UI 在收到成功回执后乐观地把 tag 从列表移除，但 `git tag -l` 仍查得到，重载后重新拉取又出现——这正是本 ADR 观察到的现象。
2. **修复**：将 `deleteTag` case 改为返回 `['tag', '-d', '--', validateToken(operation.name, 'tag name')]`。其中 `--` 用于结束选项解析，避免 tag 名以 `-` 开头时被误读为参数；`validateToken` 同时校验 tag 名合法（拒绝 `-x` 这类选项式名称）。
3. **影响范围**：单条删除（`deleteTag`）与批量 `deleteRefs` 中的 tag 分支都走 `buildOperationArguments`，故两处一并修复，无需分别改动。

## 验证

- **单元测试**：`test/unit/GitOperationService.test.ts` 断言 `buildOperationArguments({ kind: 'deleteTag', name: 'v1.0.0' })` 等于 `['tag', '-d', '--', 'v1.0.0']`（用例 "maps supported operations to shell-free Git argument arrays"）。
- **集成测试**：同文件用例 "executes local history and branch operations in a disposable repository" 在真实仓库中先 `createTag` 再 `deleteTag`，并断言 `git tag --list v1.0.0` 返回空——已通过，证明删除真正写入 git。
- **产物一致性**：`src/git/GitOperationService.ts`、`dist/extension.js`、以及根目录 `git-log-0-26.928.1103.vsix` 内打包的 `extension/dist/extension.js` 三处经核对均已包含修复后的 `["tag","-d","--",validateToken(operation.name, "tag name")]`。

## 后果

- **收益：** 删除 tag 操作真正生效，与 UI 反馈一致。
- **不做什么：** 不改变删除确认流程；不改变 `deleteRefs` 中的批量删除逻辑（该路径已正确调用 `deleteTag`）。
- **注意（运行时版本）**：本修复已落入源码、构建产物与本地 `.vsix`。若仍出现"UI 删除了、但 `git tag -l` 仍查到、重载又出现"的现象，说明**实际加载的是修复前的旧构建**（例如从 Marketplace 安装的早期版本、或换用了一份旧的 `.vsix`），而非当前 `dist/`。需重新 `npm run build` 后重载窗口（Developer: Reload Window），或从当前包重新安装；可在已加载扩展的 `dist/extension.js` 中搜索 `case "deleteTag":` 确认是否出现 `return ["tag", "-d", ...]`。

## 实施位置

`src/git/GitOperationService.ts#buildOperationArguments`（`deleteTag` case）

## 下一步

无需后续代码改动——修复已通过单元测试与集成测试验证，并已落入 `dist/` 与 `.vsix`。若运行期仍复现，按"后果"中的运行时版本说明排查。

## 关联文档

- [ADR-0019: Tag 本地与远程区分标识](ADR-0019-Tag本地与远程区分标识.md) — tag 显示逻辑
