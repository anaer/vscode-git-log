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
| **unshallow** | `git fetch --unshallow`，把浅克隆补全为完整历史（见 ADR-0010） |
| **补丁导出** | 把对比结果写成 `.patch` 文件，二进制文件被排除（见 ADR-0011） |
| **孤儿分支** | 通过 `git switch --orphan` 创建、无父提交且与既有历史无共同祖先的分支；首个提交前不存在对应 ref（见 ADR-0012） |
| **未出生分支** | HEAD 已指向某分支但该分支尚无提交、因而无 ref 的状态（见 ADR-0012） |
| **引用快照** | 扩展侧每次刷新时经 `for-each-ref` 实时取得的完整 ref 列表，随 `repositoryData` 整体下发、前端不缓存 |
| **远程跟踪引用** | `refs/remotes/<remote>/<branch>`，由远程的 fetch refspec 物化；`git push --set-upstream` 只写入上游配置，**仅当 refspec 覆盖该分支时**才创建它（见 ADR-0013） |
| **窄 refspec** | `remote.<remote>.fetch` 只覆盖部分分支的配置形态，`git clone --single-branch` 的典型产物（如 `+refs/heads/main:refs/remotes/origin/main`）；窄 refspec 下推送不会产生跟踪引用（见 ADR-0013） |
| **引用目录节点** | 引用树中按分支名 `/` 分段生成的分组节点（如 `feature/`），聚合该前缀下的本地/远程/标签引用，可作为批量删除的目标（见 ADR-0015） |
| **宿主默认右键菜单** | Electron / Chromium 为 webview 提供的原生剪切 / 复制 / 粘贴菜单；扩展面板内除可编辑元素外统一抑制（见 ADR-0014） |

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