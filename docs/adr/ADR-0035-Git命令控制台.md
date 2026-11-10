# ADR-0035: Git 命令控制台

**状态：** 已接受
**创建时间：** 2026-11-09

> **当前状态 / 核心结论：** 已实施。在唯一出口记录每条 Git 命令的子命令、参数个数、耗时、退出码与 stderr 摘要，供排障时回看；默认不留存 argv，需显式开启 `consoleVerbose` 才记录并显示脱敏后的完整 argv。不落盘、不记凭据。下一步：无需后续动作。

---

## 背景

扩展的排障入口只有 `Git Log: Show Diagnostics` 的环境快照与分类错误提示，用户无法看到「刚才那一步到底执行了什么命令、花了多久、报了什么」。Git CLI 是本扩展的事实来源，命令轨迹应当可见。

## 决策

1. **采集点唯一**：只在 `GitRunner.run` 记录，不散落到各 Service；`start-failed` 与 `close` 两条出口各发一次结构化完成记录，覆盖成功、非零退出、取消、超时与输出超限。默认字段为子命令、参数个数、耗时、退出码与 stderr 头部（上限 4 KiB，展示时再截到 500 字符）。完整 argv 仅在 `consoleVerbose` 开启时采集，避免内存中留存用户检索内容。
2. **有界存储**：进程内环形缓冲，容量由 `gitLogWorkbench.debug.consoleEntries` 控制（默认 500，0 关闭）；不写文件、不跨会话保留。配置变更即时生效，无需重载窗口：容量调小即裁剪、设为 0 即清空、关闭 `consoleVerbose` 立即移除已留存的参数值。
3. **展示**：新增独立 Output Channel「Git Log: Git Console」与命令 `Git Log: Show Git Console`；默认行为 `git <子命令> · N args · 耗时 · 退出码`，stderr 非空时附摘要；命令用当前缓冲快照一次性 `replace` 通道内容后显示，不在运行期逐条刷屏。
4. **默认开启**：`consoleEntries` 默认 500，设为 0 关闭；记录失败不得影响命令执行——Runner 侧吞掉回调异常，采集侧吞掉自身异常。
5. **脱敏**：`consoleVerbose` 开启时，argv 与 stderr 逐项过 `redactGitDiagnostic`，并把仓库路径替换为 `<repository>`；永不记录环境变量与完整 stdout。
6. **不做什么**：不做命令重放、不导出文件、不记录凭据或 remote URL 的 userinfo；不为控制台改变现有诊断通道「不记 cwd 与原始参数」的口径，该通道仍只受 `debug.logLevel` 控制。

## 后果

- **收益：** 性能问题与「命令成功但界面没反应」类故障可自证，减少来回询问。
- **代价 / 权衡：** 每条命令多一次记录构造与字符串拼接；缓冲与脱敏逻辑需要测试覆盖。
- **降级方向：** 记录失败只影响可观测性，不阻断命令执行；异常静默吞掉，因此采集本身失效时没有提示，只能从控制台内容为空反推。
- **未解决风险：** 环形缓冲不落盘，进程重启后轨迹丢失；默认看不到参数值，定位「参数传错」类问题需开启 `consoleVerbose` 后复现一次（配置即时生效，无需重载窗口）。

## 实施位置

- 采集出口与完成记录：`src/git/GitRunner.ts#GitRunner`、`src/git/GitRunner.ts#emitCommandRecord`、`src/git/GitRunner.ts#GitCommandRecord`。
- 环形缓冲、脱敏与格式化：`src/git/GitConsoleRecorder.ts#GitConsoleRecorder`、`src/git/GitConsoleRecorder.ts#formatGitConsoleSnapshot`。
- 通道创建、配置读取与即时生效：`src/extension.ts#activate`。
- 命令注册：`src/registerExtension.ts#registerExtension`。
- 命令与配置贡献：`package.json`；脱敏原语：`src/git/classifyGitError.ts#redactGitDiagnostic`。
- 用例：`test/unit/GitConsoleRecorder.test.ts`、`test/unit/GitRunner.test.ts`、`test/unit/extensionContributions.test.ts`、`test/unit/registerExtension.test.ts`。

## 证据分档

| 假设 | 档位 | 取证方式 |
|------|------|----------|
| 现有输出通道有「不记录 cwd 与原始参数」的既定口径 | **已证实** | `test/unit/GitRunner.test.ts` 的 `honors log level and does not log cwd or raw command arguments` 与 `always emits a redacted failure diagnostic even when log level is off` 两条用例断言 cwd 与虚构参数值不出现 |
| 完整 argv 会携带用户内容（搜索词、路径） | **已证实** | `git log -S<term>` / `-G<regex>` 的参数即检索内容；`--author` 为身份值 |
| 脱敏后的 argv 仍可满足常见排障 | 未证实 | 需真实故障复盘；若不足，退路是临时开启 `consoleVerbose`，不改变默认层级 |

## 验证

- `npm run typecheck`、`npm run lint`（0 error，2 条既有 react-refresh 警告）、`npm test` 全量通过：68 文件、718 通过 / 5 跳过。
- 新增 8 条采集层用例与 4 条 Runner 出口用例，覆盖环形缓冲裁剪与关闭、默认不留存 argv、verbose 下 argv / stderr 脱敏、成功 / 失败 / 启动失败 / 取消 / 输出超限均发记录、回调抛错不阻断执行。

## 下一步

无需后续动作。
