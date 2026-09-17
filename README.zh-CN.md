# Git Log

[English](README.md) | [简体中文](README.zh-CN.md)

[![Visual Studio Marketplace Version](https://vsmarketplacebadges.dev/version-short/ascenx.git-log.svg?label=Marketplace&color=007ACC)](https://marketplace.visualstudio.com/items?itemName=ascenx.git-log)
[![Open VSX Version](https://img.shields.io/open-vsx/v/ascenx/git-log?label=Open%20VSX)](https://open-vsx.org/extension/ascenx/git-log)

一个面向 VS Code 的可视化 Git 日志、提交图谱、历史浏览和仓库操作扩展。

Git Log 的目标不是给 VS Code 内置 Source Control 换一个皮肤，而是在 VS Code 中提供完整的 Git 日志工作流：左侧引用树、中央提交拓扑图、右侧变更文件树、提交详情、原生 Diff，以及围绕分支和提交的常用操作。

## 安装

前往 [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=ascenx.git-log) 安装 **Git Log — Commit Graph & History**，也可以在 VS Code 扩展视图中搜索 `ascenx.git-log`。

Git Log 支持 VS Code 1.85.2 及更高版本，同时要求 Git 2.27 或更高版本。

还可以通过命令行安装：

```bash
code --install-extension ascenx.git-log
```

## 功能截图

### Git Log 主界面

![Git Log 主界面](https://raw.githubusercontent.com/anaer/vscode-git-log/main/images/git_log_workbench.png)

### 当前行 Blame 与编辑器菜单

![当前行 Blame 与编辑器菜单](https://raw.githubusercontent.com/anaer/vscode-git-log/main/images/git_blame_and_menu.png)

### 文件历史

![文件历史](https://raw.githubusercontent.com/anaer/vscode-git-log/main/images/file_history.png)

### 行历史

![行历史](https://raw.githubusercontent.com/anaer/vscode-git-log/main/images/line_history.png)

### 与分支或标签比较

![与分支或标签比较](https://raw.githubusercontent.com/anaer/vscode-git-log/main/images/branch_compare.png)

## 核心原则

1. 优先提供高信息密度、清晰且高效的 Git 日志操作路径。
2. Git CLI 是仓库数据和操作的最终事实来源。
3. 编辑、Diff 和合并尽量复用 VS Code 原生能力。
4. 大仓库必须采用分页、缓存和虚拟滚动，不能一次读取完整历史。
5. 所有破坏性操作都必须展示明确目标、影响范围和确认步骤。
6. 每个实施阶段都必须有自动化测试和可执行验收命令。

## 已实现的 Git Log 功能

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Ref filter │ Text/hash │ Branch │ User │ Date │ Paths │ Actions   │
├─────────────┬───────────────────────────────────┬───────────────────┤
│ HEAD        │ Commit graph                      │ Changed files     │
│ Local       │ ● fix: ...        main   Alice   │ src/              │
│   main      │ │\                                │   extension.ts    │
│   feature   │ │ ● feat: ...     feature Bob    │ package.json      │
│ Remote      │ ●─┘ refactor: ...                 │                   │
│ Tags        │                                   │                   │
├─────────────┴───────────────────────────────────┴───────────────────┤
│ Commit message │ hash │ author │ date │ parents │ action toolbar    │
└─────────────────────────────────────────────────────────────────────┘
```

当前版本已经覆盖实施路线的 Milestone 0–6，以及 Milestone 7 中的编辑器历史专项：

- 多根工作区仓库发现，支持普通仓库、bare repository、linked worktree 和 detached HEAD。
- Refs / Commit Graph / Changed Files / Commit Details 四区联动。
- Branch 区域提供独立搜索，并将名称中带 `/` 的 Local、Remote、Tag 引用递归分组为可展开/收起的文件夹；本身包含 `/` 的 Remote 名称仍作为独立的顶层文件夹。
- Branches 标题行提供批量清理入口：对话框一次列出「上游已消失」与「已合并入当前分支」两类本地分支，逐条展示未合并提交数与最后提交时间。`gone` 分支默认勾选，未合并分支默认不勾选；删除按分支逐条执行，失败项照常列出而不会中断其余分支。
- Git Log 作为 VS Code 底部 Panel 的独立 Tab 展示，与问题、输出、终端等工具窗口并列；点击 `Open Log` 会直接聚焦该 Tab，不再打开编辑器页或经过中间欢迎页。
- 分页日志、有界滑动窗口、自定义 DAG lane、跨窗口 graph continuation、固定行高虚拟滚动和大列表性能基准；深分页的全局 offset、选择和相对滚动位置可恢复。`Go to HEAD` 会在当前筛选后的 Commit 列表中定位已 Checkout 的 HEAD，并将其对齐到首个可见行，不会切换当前 Branch 筛选。
- Text/Hash、Branch、User、Date、Path 组合过滤，旧查询取消和过期响应拒绝；仓库状态刷新不会覆盖正在编辑的搜索草稿；文本查询按 canonical `git log --date-order` 顺序扫描完整正文、作者姓名与邮箱，保留 child-before-parent 拓扑。
- Root、Merge、Rename、Copy、Binary 等 changed-files 场景及 VS Code 原生 Diff；多选 Commit 时会合并展示所有选中 Commit 的变更文件，并为每个文件保留正确的 Commit 与 Parent 上下文。
- Checkout、Checkout Revision、Branch、Tag、Fetch、Pull、Push、Cherry-pick、Revert、Merge、Rebase、Reset、Rename/Delete Branch，以及 Commit/Local/Remote/Tag/HEAD 对应的上下文菜单。
- 浅克隆仓库会在 Commit 列表上方显示「历史被截断」提示，并提供 **Fetch full history** 动作，执行 `git fetch --unshallow` 拉取完整历史；对 fetch refspec 只覆盖单一分支的单分支克隆，确认框会逐字列出改动，补全后把该 refspec 扩展为覆盖全部分支，使此前不可见的远程分支显示出来。
- 提供完整 Stash 管理：可选择是否包含未跟踪文件，并支持查看 Stash 变更、Apply、Pop 和确认后 Drop。
- 单击或双击分支只会选择该分支并展示对应 Commit，不会自动 Checkout；Checkout 保留在 Ref 右键菜单中，必须显式执行。
- 支持使用 Shift+单击或 Shift+方向键连续多选 Commit，也可使用 Ctrl/Cmd+单击逐个切换非连续选区；Changed Files 会合并所有选中 Commit，`Drop commits…` 和 `Squash commits…` 仍仅对连续选区开放。Squash 输入框会按界面从上到下预填所有选中 Commit 的完整消息。历史改写要求工作区干净并二次确认，同时拒绝 Root Commit、Merge Commit、过期选区，以及确认期间发生的当前分支或 HEAD 变化。
- 非当前 Local Branch 的右键菜单提供需要二次确认的 `Force Delete…`；普通删除因分支未合并而失败时，也会提供警告色的强制删除恢复按钮。错误提示固定展示五秒后自动关闭。
- 同 common Git dir 写操作串行、按仓库维护 Webview in-flight 锁、危险操作模态确认、Git 错误分类、脱敏 Output Channel 和完成后重新读取 Git 状态。
- Pane/Column 拖动、Pane 折叠与 workspace 宽高持久化；Commit Details 可在全宽底部和 Changed Files 底部之间切换，位置会跨面板会话保留；Commit、Author、Date、Refs 四列固定展示，深分页选择和滚动位置可在重开面板后恢复。
- Commit 与 Refs 等表格列的分隔线可直接拖动并持久化宽度；Changed Files 支持深路径横向滚动，增删行数分别使用绿色和红色。
- Changed Files 单击预览、Tree/List、Show Diff、Open File at Revision、Open Current File、Copy Path，以及 Commit/Ref/File 上下文菜单；菜单支持外部点击和执行后自动关闭。
- Compare with Current 打开独立文件列表，展示文件状态及绿色新增/红色删除行数；可选择单个文件打开 VS Code 原生 Diff，也可通过 `All Changes` 在同一个多文件 Diff 中查看全部非二进制文件。
- 编辑器右键提供 `Git Log` 子菜单：可查看当前行/选区历史、查看完整文件历史，或将当前工作区文件与 Local Branch、Remote Branch、Tag 中的同路径文件比较。
- Explorer 右键提供 `Git Log` 子菜单：文件可打开现有 File History 独立 Tab，文件夹则在底部 Git Log 中按目录递归过滤 Commit；关闭 Folder History 后会恢复之前的日志筛选和位置。
- 当前行 Blame 使用适配主题的淡色文字展示作者、相对时间和 Commit 主题；鼠标悬停后展示作者邮箱、精确时间、Commit Hash 和完整消息。未提交内容的编辑时间会自动更新并保存在工作区状态中；启用 VS Code 内置的 `git.blame.editorDecoration.enabled` 后，插件装饰会自动停用以避免重复展示。
- 行历史会先把工作区行号映射到 `HEAD`；未保存内容使用 Extension Host 内存快照参与映射且不会触发保存，纯未提交新增行显示明确空状态，部分未提交或不连续选区不会错误归属 Commit；文件历史支持 rename、分页、按 HEAD 缓存和绿色/红色增删统计。
- Current Line、Selection 和 File History 均打开独立编辑器 Tab，左侧列出相关 Commit 和绿色/红色增删统计；左右区域的分隔线可拖动并记忆宽度。
- History 右侧保留聚焦范围或完整文件的 Inline Diff，并由独立 Worker 使用按实际文件类型延迟加载 grammar 的 Shiki 生成语法高亮；右上角 `VS Code Diff` 可将当前 Commit 的文件变化打开到原生 Diff Editor，继承 minimap、搜索、语法能力和标准快捷键。切换 Commit 会终止旧高亮任务，超时、超大 patch、超长单行或过高 token 预算会自动退回纯文本预览，不阻塞 Extension Host。
- 完整键盘导航、搜索框双层 `Escape`、`Ctrl/Cmd+C` 复制 Hash，以及浅色、深色和高对比主题支持。
- 当前分支顶端的 Commit 支持 Amend HEAD，可编辑提交信息并包含已暂存变更。

## 命令与菜单

以下为本扩展在 `package.json` 中贡献的全部命令与菜单，可在命令面板（`Ctrl/Cmd+Shift+P`）或对应右键菜单中使用。所有命令的分类均为 `Git Log`。

### 命令

| 命令（Title） | 命令 ID | 命令面板 | 中文说明 |
|---|---|---|---|
| Open Log | `gitLogWorkbench.openLog` | ✅ | 打开底部 Git Log 面板主界面。 |
| Show History for Current Line | `gitLogWorkbench.editor.showLineHistory` | ✅ | 在独立编辑器 Tab 查看光标所在行的提交历史。 |
| Show History for Selection | `gitLogWorkbench.editor.showSelectionHistory` | ✅ | 查看当前编辑器选区的提交历史。 |
| Show File History | `gitLogWorkbench.editor.showFileHistory` | ✅ | 打开当前文件的完整提交历史。 |
| Compare File with Branch or Tag… | `gitLogWorkbench.editor.compareFileWithRef` | ✅ | 将当前文件与某个分支或标签中的同路径文件进行比较。 |
| Show Folder History | `gitLogWorkbench.explorer.showFolderHistory` | ❌（仅右键菜单） | 在资源管理器中对文件夹按目录递归过滤提交；不在命令面板显示。 |

### 右键菜单

| 菜单位置 | 子菜单 | 菜单项（命令） | 显示条件 | 分组 |
|---|---|---|---|---|
| 编辑器右键（`editor/context`） | `Git Log` | Show History for Current Line | 文件且无选区 | `1_history@1` |
| 编辑器右键（`editor/context`） | `Git Log` | Show History for Selection | 文件且有选区 | `1_history@1` |
| 编辑器右键（`editor/context`） | `Git Log` | Show File History | 文件 | `1_history@2` |
| 编辑器右键（`editor/context`） | `Git Log` | Compare File with Branch or Tag… | 文件 | `2_compare@1` |
| 资源管理器右键（`explorer/context`） | `Git Log` | Show File History | 文件（非文件夹） | `1_history@1` |
| 资源管理器右键（`explorer/context`） | `Git Log` | Show Folder History | 文件夹 | `1_history@1` |

> `Git Log` 子菜单仅在右键目标为本地文件（`resourceScheme == file`）时出现。

### 视图

| 位置 | 名称 | 类型 | 说明 |
|---|---|---|---|
| 底部面板（Panel） | Git Log | webview | Git Log 主界面，作为底部面板 Tab 呈现，不占用活动栏。 |

### 插件界面内的右键菜单（Webview）

以下是在 Git Log 界面内右键弹出的上下文菜单，按右键目标分组。标注「裸仓库 / 进行中操作」的项在裸仓库或有变基等操作进行中时不可用；若仓库有进行中的操作或为裸仓库，工具栏菜单只显示提示文字。当前分支尚未建立上游时，工具栏右键与本地分支右键的 Push 项显示为 Publish Branch。

**工具栏右键**

| 菜单项 | 说明 |
|---|---|
| Pull | 拉取当前分支（需存在当前分支）。 |
| Push | 推送当前分支（需存在当前分支）。 |
| Publish Branch | 发布当前分支：推送并建立上游（当前分支无上游时替代 Push，需存在当前分支）。 |
| Force Push with Lease… | 以 `--force-with-lease` 强制推送（需存在当前分支）。 |

**提交行右键（Commit）**

| 菜单项 | 可用条件 | 说明 |
|---|---|---|
| Drop commits… | 连续多选、≤100 条、非裸/无进行中 | 丢弃选中的多个提交。 |
| Squash commits… | 连续多选、≤100 条、非裸/无进行中 | 将选中的多个提交压缩为一个。 |
| Edit Commit Messages… | 选中 ≥1、≤100 条、非裸/无进行中 | 批量改写提交信息。 |
| Compare with Parent | 非根提交 | 与父提交比较，打开全部变更文本文件。 |
| Compare with Current | 该提交非当前 HEAD | 与当前 HEAD 比较。 |
| Checkout Revision | 单选、非裸/无进行中 | 以 detached HEAD 检出该提交。 |
| Amend HEAD… | 单选且为当前 HEAD 且有当前分支 | 修改 HEAD 提交信息并纳入已暂存变更。 |
| New Branch… | 非裸/无进行中 | 基于该提交新建分支。 |
| New Tag… | 非裸/无进行中 | 基于该提交新建标签。 |
| Cherry-pick | 非裸/无进行中 | 将该提交摘取到当前分支。 |
| Revert | 非裸/无进行中 | 撤销该提交。 |
| Merge into Current | 该提交非当前 HEAD | 将该提交合并进当前分支。 |
| Rebase Current onto This | 该提交非当前 HEAD | 把当前分支变基到该提交。 |
| Soft Reset | 存在当前分支 | 软重置到该提交。 |
| Mixed Reset | 存在当前分支 | 混合重置到该提交。 |
| Hard Reset… | 存在当前分支 | 硬重置到该提交（需二次确认）。 |
| Copy Hash | 始终 | 复制提交哈希。 |
| Copy Subject | 始终 | 复制提交标题。 |
| Copy Full Message | 已加载该提交详情 | 复制完整提交信息。 |

**变更文件右键（File）**

| 菜单项 | 可用条件 | 说明 |
|---|---|---|
| Show Diff | 非二进制文件 | 打开文本差异编辑器。 |
| Open File at Revision | 非二进制；删除文件需有父版本 | 打开该提交版本的文件内容。 |
| Open Current File | 始终 | 打开工作区中的当前文件。 |
| Copy Path | 始终 | 复制文件路径。 |
| Filter by Path | 始终 | 按该文件路径过滤提交日志。 |

**引用右键（Ref，分支 / 远程 / 标签树）**

| 菜单项 | 适用对象 | 可用条件 | 说明 |
|---|---|---|---|
| Compare with Current | 全部 | 非当前 HEAD | 与当前 HEAD 比较。 |
| Copy Name | 全部 | 始终 | 复制引用短名。 |
| New Branch from… | 全部 | 非裸/无进行中 | 基于该引用新建分支。 |
| Checkout | 本地分支、标签 | 本地分支非当前 | 检出该分支/标签。 |
| Merge into Current | 本地分支 | 有当前分支且非当前分支 | 合并进当前分支。 |
| Rebase Current onto | 本地分支 | 有当前分支且非当前分支 | 把当前分支变基到该分支。 |
| Push | 本地分支 | 仅当前分支 | 推送该分支。 |
| Publish Branch | 本地分支 | 仅当前分支且无上游 | 发布该分支：推送并建立上游，仅写入该分支的上游绑定。 |
| Rename… | 本地分支 | 非裸/无进行中 | 重命名分支。 |
| Delete… | 本地分支 | 非当前分支 | 删除分支（未合并失败时提供强制删除）。 |
| Checkout as New Local… | 远程分支 | 非裸/无进行中、非 `…/HEAD` | 基于远程分支新建并检出本地分支。 |
| Fetch | 远程分支 | 非裸/无进行中 | 从该远程拉取。 |
| Delete Remote Branch… | 远程分支 | 非裸/无进行中 | 删除远程分支（需确认）。 |
| Delete Local Tag… | 标签 | 非裸/无进行中 | 删除本地标签（需确认）。 |

**HEAD 行右键（Head）**

| 菜单项 | 可用条件 | 说明 |
|---|---|---|
| Copy Revision | 始终 | 复制 HEAD 修订号。 |
| Create Branch… | 非裸/无进行中 | 基于 HEAD 新建分支。 |
| Create Tag… | 非裸/无进行中 | 基于 HEAD 新建标签。 |
| Reset Current Branch (soft) | 存在当前分支 | 将当前分支软重置到 HEAD。 |
| Reset Current Branch (mixed) | 存在当前分支 | 将当前分支混合重置到 HEAD。 |
| Reset Current Branch (hard)… | 存在当前分支 | 将当前分支硬重置到 HEAD（需确认）。 |

## 本地开发

```text
npm install
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run build
```

在 VS Code 中选择 `Run Extension` 启动 Extension Development Host，然后执行命令 `Git Log: Open Log`；也可以直接点击底部 Panel 的 `Git Log` Tab。

生成本地 VSIX：

```text
npm run package
```


## 使用提示

- 单击或双击 Local/Remote Branch 只展示该分支的 Commit 历史，不会 Checkout；需要切换分支时请使用 Local Branch 的右键菜单。
- 使用 `Go to HEAD` 可在当前正在查看的 Commit 列表中定位仓库已 Checkout 的 HEAD，不会切换当前 Branch 筛选。
- 仅在确认需要删除尚未完全合并的非当前 Local Branch 时使用 `Force Delete…`；执行前 Git Log 会显示模态二次确认。
- 使用 Branch 区域搜索框可在本地过滤引用；名称中带 `/` 的引用会按文件夹分组，各层级可独立展开或收起。
- 按住 Shift 单击另一个 Commit，或使用 Shift+上/下方向键扩展连续选区；Windows/Linux 使用 Ctrl+单击、macOS 使用 Cmd+单击可逐个切换非连续 Commit。Changed Files 会合并所有选中 Commit，`Drop commits…` 和 `Squash commits…` 仅在选区连续时显示。
- 右键单个 Commit 可执行 `Checkout Revision`，以 detached HEAD 状态查看该版本；如果需要保留后续提交，请先创建分支。
- 单击 Changed File 查看路径、状态和增删摘要；双击或右键 `Show Diff` 使用 VS Code 原生 Diff Editor。
- 在 Commit Comparison 中使用 `All Changes` 可集中查看全部文本文件变化；二进制文件仍会列出，但不会进入多文件 Diff。
- 使用 Commit Details 中的箭头按钮，可将详情移动到 Changed Files 底部或切回全宽底部；所选位置会按 workspace 保存。
- 在普通本地文件编辑器中右键打开 `Git Log`：无选区时查看当前行历史，有选区时查看选区历史，也可在独立 Tab 打开完整 File History；Branch/Tag 比较使用 VS Code 原生 Diff，因此自动继承 minimap、语法高亮、搜索和 Diff 快捷键。
- 当前行历史默认在每处修改上下各展示 3 行弱化的逻辑上下文；格式化变更中的新旧上下文会按相对位置对齐，Commit 列表也会过滤只修改了 Git 扩张追踪范围内其他行的提交。可通过 `gitLogWorkbench.lineHistory.contextLines` 在 `0` 到 `20` 之间调整，设为 `0` 时仅展示目标行变更。
- 在 Explorer 中右键本地文件或文件夹并打开 `Git Log`：文件使用独立 File History Tab，文件夹会把底部 Git Log 过滤为曾修改该目录的 Commit；点击 `Back` 可恢复之前的筛选和位置。Git 不把文件夹作为独立对象保存，因此 Folder History 不会自动跟踪目录重命名。
- 当前行 Blame 默认启用，可以通过 `gitLogWorkbench.currentLineBlame.enabled` 关闭。
- `Ctrl/Cmd+F` 聚焦搜索，`Ctrl/Cmd+L` 聚焦 Commit Log，`Ctrl/Cmd+C` 复制选中 Commit 的完整 Hash；方向键、PageUp/PageDown、Home/End 可浏览提交。
- 搜索框第一次按 `Escape` 清空搜索，搜索为空时再次按 `Escape` 返回 Commit Graph。
- Pane 和 Commit 列可鼠标拖动，也可聚焦分隔条后使用方向键调整；工具栏可折叠 Refs/Changed Files，Commit、Author、Date、Refs 始终全部展示。
- User 筛选会根据仓库的 `git config user.name/user.email` 始终置顶 `Me（当前 Git 用户）`，并优先使用邮箱过滤；顶部工具按钮均提供悬停说明。
- Refresh 只读取本地状态；Fetch、Pull、Push 会访问用户现有 remote，并复用系统 credential helper/SSH Agent。
- 顶部 `Stashes` 用于创建、查看、Apply、Pop 或 Drop 暂存工作。

## 安全与隐私

- 所有 Git 命令使用 `spawn` 参数数组且不开 shell。
- 扩展不保存密码、Token 或 SSH 私钥；remote 认证完全交给 Git。
- Output Channel 会脱敏 URL userinfo，不记录文件内容或完整环境变量。
- Hard Reset、Force Push with Lease、Branch Delete、Force Delete 等危险操作会显示仓库和实际目标并要求确认。
- Force Push 的目标解析、确认与执行都在同一 common Git dir 队列锁内完成，固定 source object ID，并拒绝隐式或非完整目标 refspec。
- 文本历史扫描单次 stdout 上限为 64 MiB，rolling match cache 有界，Webview commit window 受 `maxCachedCommits` 限制。
- 默认不采集遥测。
