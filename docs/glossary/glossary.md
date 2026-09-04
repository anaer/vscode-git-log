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