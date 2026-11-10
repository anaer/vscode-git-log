# 术语表

## 核心概念

| 术语 | 定义 |
|------|------|
| **Commit Graph** | Git 提交历史的 DAG（有向无环图）可视化表示 |
| **Blame** | 显示文件每一行最后修改的提交和作者信息 |
| **Workbench** | 扩展的主界面，包含提交列表、引用面板、文件面板等 |
| **虚拟滚动** | 只渲染可视区域内的列表项，提升大列表性能 |
| **LRU 缓存** | 最近最少使用缓存策略 |
| **热路径** | 频繁执行的代码路径 |
| **God Component** | 包含过多职责的单一组件（反模式） |
| **Operation Queue** | 操作队列，串行化 Git 写操作避免并发冲突 |
| **提交对象重建** | 用 `git hash-object -t commit -w --stdin` 按新消息与 parent 重建 commit 对象，用于批量改写历史（见 ADR-0006） |
| **发布分支** | 对尚无上游的本地分支执行一次性 `git push --set-upstream <remote> <branch>`；仅写入该分支的上游绑定（`branch.<name>.remote` / `.merge`），不改写 `push.autoSetupRemote`（见 ADR-0007） |
| **gone 分支** | 上游远程分支已被删除、`%(upstream:track)` 显示 `[gone]` 的本地分支（见 ADR-0008） |
| **mailmap** | Git 身份别名映射文件，把同一作者的不同姓名与邮箱归并为一个显示身份（见 ADR-0009） |
| **作者身份改写** | 在提交对象重建闭环中重写 commit 的 `author` 与 `committer` 行，改变受影响 commit 的 oid（见 ADR-0009） |
| **浅克隆** | 只含有限历史的仓库（`git clone --depth`），提交图会被截断（见 ADR-0010） |
| **unshallow** | `git fetch --unshallow`，把浅克隆补全为完整历史；深度已越根提交时再调会报错（见 ADR-0010） |
| **deepen** | `git fetch --deepen=N`，在当前深度上再增加 N 条历史，可反复调用逐步加深；越过根提交后 git 自动清除 shallow 边界（见 ADR-0010） |
| **补丁导出** | 把对比结果写成 `.patch` 文件，二进制文件被排除（见 ADR-0011） |
| **补丁应用** | 选择外部 `.patch` / `.diff`，经 `git apply --check` 预览确认后写入工作区；失败可改用 `--3way`（见 ADR-0026） |
| **孤儿分支** | 通过 `git switch --orphan` 创建、无父提交且与既有历史无共同祖先的分支；首个提交前不存在对应 ref；要求 Git 2.23+，2.20–2.22 隐藏入口（见 ADR-0012、ADR-0024） |
| **Git 能力集** | 按检测到的 Git 版本推导出的功能开关集合（当前含 `version`、`createOrphanBranch`），随初始化下发前端，用于隐藏旧版不支持的功能入口（见 ADR-0024） |
| **身份映射候选** | 用 `.mailmap` 将所选 commit 的原始姓名/邮箱解析为规范身份后生成的候选列表（见 ADR-0030） |
| **Git 配置档** | 以目录为条件、通过 `includeIf` 生效的一组 Git 配置（身份与常用字段），由扩展创建并管理（见 ADR-0032） |
| **托管 include 条目** | 全局 Git 配置中指向 `~/.git-log/identities/` 的 `includeIf` 条目，可在扩展内编辑；其他 includeIf 条目只读（见 ADR-0032） |
| **Git 版本矩阵** | CI 中同时验证最低支持 Git（2.20）与系统 Git 的测试矩阵（见 ADR-0031） |
| **诊断报告** | 汇总扩展、Git 版本/能力集与仓库状态并写入 Output Channel 的排障报告，凭据脱敏（见 ADR-0028） |
| **未出生分支** | HEAD 已指向某分支但该分支尚无提交、因而无 ref 的状态（见 ADR-0012） |
| **引用快照** | 扩展侧每次刷新时经 `for-each-ref` 实时取得的完整 ref 列表，随 `repositoryData` 整体下发、前端不缓存 |
| **远程跟踪引用** | `refs/remotes/<remote>/<branch>`，由远程的 fetch refspec 物化；`git push --set-upstream` 只写入上游配置，**仅当 refspec 覆盖该分支时**才创建它（见 ADR-0013） |
| **窄 refspec** | `remote.<remote>.fetch` 只覆盖部分分支的配置形态，`git clone --single-branch` 的典型产物（如 `+refs/heads/main:refs/remotes/origin/main`）；窄 refspec 下推送不会产生跟踪引用（见 ADR-0013） |
| **引用目录节点** | 引用树中按分支名 `/` 分段生成的分组节点（如 `feature/`），聚合该前缀下的本地/远程/标签引用，可作为批量删除的目标（见 ADR-0015） |
| **宿主默认右键菜单** | Electron / Chromium 为 webview 提供的原生剪切 / 复制 / 粘贴菜单；扩展面板内除可编辑元素外统一抑制（见 ADR-0014） |
| **下一步提示** | 从 Git 错误输出映射出的一句可执行建议，随错误横幅一起展示（见 ADR-0025） |
| **中断状态条** | merge / rebase / cherry-pick / revert 未完成时，在日志上方常驻显示当前操作与 Continue / Abort 的横幅（见 ADR-0025） |
| **Pull 策略** | 显式选择 fast-forward-only / merge / rebase 的拉取方式，覆盖全局 git 配置（见 ADR-0027） |
| **托管商链接模板** | 由 remote URL 与托管商模板拼出的提交 / 文件 / 行链接，识别不出托管商时不生成（见 ADR-0034） |
| **Git 控制台** | 记录每条 Git 命令的子命令、参数个数、耗时、退出码与 stderr 摘要的有界内存轨迹，完整 argv 默认不留存（见 ADR-0035） |
| **内容检索（pickaxe）** | 用 `git log -S` / `-G` 按代码内容而非提交消息检索历史（见 ADR-0036） |
| **受保护分支** | 默认为 `main` / `master`、禁止强推与改写已推送提交的分支集合，可由配置扩展（见 ADR-0037） |
| **部分摘取 / 部分还原** | 只把某个提交（或其父提交）中选定的文件或目录恢复到工作区，而非整提交操作（见 ADR-0038） |
| **推送预览** | 推送前展示待推提交、文件统计、目标分支与标签的确认页（见 ADR-0039） |
| **自动储藏（autostash）** | 把 rebase / merge / pull 前的脏工作区改动临时 stash、操作后自动还原；失败时必须显式恢复（见 ADR-0040） |
| **交互式变基 todo** | 由 webview 编辑、经 `GIT_SEQUENCE_EDITOR` 一次性写回的 rebase 指令列表（pick/reword/edit/squash/fixup/drop）（见 ADR-0041） |
| **界面本地化** | 用 VS Code l10n（`package.nls` + `l10n/` bundle）与 webview 集中字典提供中英文文案；webview 从注入的 `vscode.env.language` 选字典，缺 key 回退英文，Git 原始输出不翻译（见 ADR-0043） |

## 技术术语

| 术语 | 定义 |
|------|------|
| **Extension Host** | VSCode 扩展宿主进程，运行 TypeScript 后端代码 |
| **Webview** | VSCode 中的 iframe 沙箱环境，运行 React 前端 |
| **Shiki** | 语法高亮引擎，支持 Web Worker 模式 |
| **esbuild** | 快速的 JavaScript 打包工具 |
| **onStartupFinished** | VSCode 扩展激活事件，在启动完成后立即激活 |
| **AbortController** | 用于取消异步操作的 API |
| **generation counter** | 生成计数器，用于追踪请求新鲜度 |
| **CAS update-ref** | `git update-ref` 携带期望旧值原子切换分支，防止并发改写冲突（见 ADR-0006） |