# ADR-0032: 多仓库 Git 配置档（includeIf）设置

**状态：** 已接受
**创建时间：** 2026-11-07

> **当前状态 / 核心结论：** 已实现命令面板向导，按目录生成 `includeIf "gitdir:..."` 条件包含，把工作/私人等 Git 配置档写入全局配置与 `~/.git-log/identities/*.inc`；配置字段为身份 + 常用字段，写入前备份、变更预览与二次确认，仅管理扩展自己创建的条目。下一步：无需后续动作。

---

## 背景

工作与私人仓库共用同一份全局 Git 身份，切换需手改配置；`includeIf` 可按 `.git` 目录条件包含不同配置文件。扩展最低支持 Git 2.20：`gitdir`（2.13+）可用，`onbranch`（2.23+）与 `hasconfig:remote.*.url`（2.36+）不可依赖；当前扩展没有设置界面，Git 配置仅读。

## 决策

1. **入口**：新增命令 `gitLogWorkbench.config.multiRepo`（命令面板），用 `QuickPick` / `InputBox` / 文件夹选择器完成「新建 / 编辑 / 删除配置档」；「Use Current Repository…」快捷入口复用 `resolveRepositoryRoot` 预填目录。不新增 webview 设置页。
2. **数据模型与落盘**：配置档 = 目录条件 + 6 个可选字段（`user.name`、`user.email`、`user.signingkey`、`commit.gpgsign`、`core.sshCommand`、`pull.rebase`）。每个配置档生成 `~/.git-log/identities/<名称>.inc`，并在有效全局配置追加 `[includeIf "gitdir:<目录>/"] path = <inc>`；Windows 使用 `gitdir/i`；目录统一为绝对路径或 `~/` 前缀并补尾 `/`；只写已填字段。
3. **全局配置定位与边界**：以 `git config --global --list --show-origin -z` 的实际来源文件为准，空配置回退 `~/.gitconfig`；`--global` 在 XDG 文件存在时由 Git 自行选择。仅路径落在 `~/.git-log/identities/` 下的 includeIf 条目为可编辑的「托管条目」，其余 includeIf 条目只读展示；重复目录条件拒绝，父子目录重叠提示「后写入者覆盖」。
4. **写入安全**：每次变更前把全局配置与受影响的 `.inc` 备份到 `~/.git-log/backups/<时间戳>/`，展示结构化变更摘要（新增/修改/删除的条件与键值）并二次确认；`.inc` 用临时文件 + rename 原子写，includeIf 条目经 `git config --file` 修改（自带锁）。拒绝含控制字符、双引号或换行的路径/值，不写入任何凭据或令牌。
5. **回验**：写入后在目标目录（若已是仓库）执行 `git config --get user.name|user.email` 回验条件是否生效；实际身份与配置档不一致时提示实际生效身份与重叠目录条件，备份保留。

**不做什么：** 不支持 `onbranch` / 远程 URL 条件、任意 key=value 编辑、写仓库内 `.git/config`、仅扩展内 `-c` 注入、凭据管理；不为 Git <2.20 提供降级。

## 后果

- **收益：** 终端、其他 IDE 与本扩展统一按目录生效；不改仓库内文件，删除配置档即可回退。
- **代价 / 权衡：** 修改的是跨工具共享的全局配置，必须保留备份与确认；名称即文件名，重命名会改变 include 路径。
- **未解决风险：** 并发写可能被 Git 配置锁拒绝（提示重试）；父子目录重叠依赖写入顺序；Windows 路径大小写、符号链接与 `~` 在不同机器的解析差异需真机验证。

## 证据分档

| 假设 | 档位 | 取证方式 |
|------|------|----------|
| `gitdir` 自 2.13、`onbranch` 自 2.23、`hasconfig:remote.*.url` 自 2.36 | 已证实 | git-config 文档与 Git 2.23 / 2.36 发布说明 |
| `git config --file <global> --add 'includeIf.gitdir:<dir>.path' <file>` 可写入；`--unset <key> '^<path>$'` 只删除托管值，缺失时退出码 5 | 已证实 | 本机 Git 2.21 临时 HOME 实测与单测 |
| `--global` 在只有 XDG 配置时写入 XDG 文件，无配置时创建 `~/.gitconfig` | 已证实 | 本机 Git 2.21 临时 HOME 实测 |
| `gitdir/i` 写法可被 `git config` 接受 | 已证实 | 本机 Git 2.21 实测 |
| Windows 路径匹配与 `gitdir/i` 大小写行为 | 未证实 | 需在 Windows 真机回验 |

## 实施位置

- 配置读写：`src/git/GitConfigService.ts#GitConfigService`（全局配置定位、includeIf 解析、`.inc` 原子读写、备份与变更摘要）。
- 向导入口：`src/commands/GitConfigSettingsCommand.ts#GitConfigSettingsCommand`，目录快捷入口复用 `src/commands/resolveRepositoryRoot.ts#resolveRepositoryRoot`。
- 命令注册：`src/registerExtension.ts#registerExtension`、`src/extension.ts#activate`、`package.json`（`contributes.commands` 与 `activationEvents`）。
- 文档：`README.md`、`README.zh-CN.md` 的命令表与使用提示。

## 验证

- 单测：`test/unit/GitConfigService.test.ts` 10 项通过（临时 HOME 隔离），覆盖全局配置定位（默认 / 旧版 / XDG / `GIT_CONFIG_GLOBAL`）、includeIf 解析与外部条目只读、创建 / 编辑 / 删除后的条目与文件内容、共享条件只删除托管值、`~/` 形式的托管条目可删除、备份内容、重叠目录提示、非法名称 / 相对目录 / 空字段 / 重复条件拒绝、Windows `gitdir/i` 归一化，以及真实仓库内 `git config --get` 回验。
- 闸门：`npm run typecheck`、`npm run lint`、`npm run build` 通过；`npm run test:unit` 696 项通过，另有 2 项与本改动无关的既有失败（本机 Git 2.21 无 `git switch`；`release.yml` 已被仓库删除）。
- 未执行：Windows 真机路径匹配与大小写行为（见「未解决风险」）。

## 关联文档

- [ADR-0024: 最低 Git 版本降至 2.20 与能力驱动的功能隐藏](ADR-0024-最低Git版本与能力隐藏.md) — 本 ADR 仅采用 2.20 可用的 `gitdir` 条件，最低版本变化时需复核可用条件。

## 下一步

无需后续动作。
