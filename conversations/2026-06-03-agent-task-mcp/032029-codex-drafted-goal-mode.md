# 交接记录 — 032029 · codex · drafted-goal-mode

## 继承的上下文

本文件继承并压缩以下记录：

- `conversations/2026-06-03-agent-task-mcp/032013-codex-researched-agent-mcp.md`

用户目标：把当前 Multi-CLI 项目大力重构为 Sidekick MCP，一个更轻、更清晰的 ask-other-agent MCP server。新项目只支持 Claude/Gemini/Codex/OpenCode 最新版本，可以彻底断开旧包名、旧 binary 和旧 tool surface。

已锁定决策：

- 项目/MCP 名称：`Sidekick`。
- npm package：`@hrz6976/sidekick-mcp`。
- binary：`sidekick-mcp`。
- 不保留旧 `@osanoai/multicli`、`multicli`、`Ask-Claude` 等兼容 alias。
- 只保留简洁工具面：`sidekick_start_task`、`sidekick_list_models`、`sidekick_cleanup_worktree`、`sidekick_setup`。
- 配置缺失时只暴露 `sidekick_setup`，返回生成配置的 prompt/template。
- Sidekick home：`~/.sidekick-mcp`，配置、任务 metadata、日志和运行时文件都放这里。
- 默认配置路径：`~/.sidekick-mcp/config.json`；可支持 `SIDEKICK_MCP_CONFIG_PATH` 覆盖。
- ask 调用走 MCP Tasks，设计为 task-first/task-only；不要继续靠加长普通 tool timeout。
- Task persistence 只做轻量落盘：metadata/log/worktree 记录保留，不做 durable queue、daemon 或 server 重启续跑。
- 默认权限模式：`edit`；`read-only` 和 `full-access` 由调用方显式覆盖。
- Worktree 策略：Claude/Gemini 优先使用 CLI 原生 worktree；Codex/OpenCode 由 Sidekick 创建 git worktree 后用 `--cd` / `--dir` 指定目录。
- Worktree 默认保留；任务结果提醒主 agent 可在确认不再需要后调用 `sidekick_cleanup_worktree` 做 GC。
- OpenCode 模型发现只能读取已配置模型，不能触发 provider 全量刷新；不要使用 `opencode models --refresh`。
- Gemini runner 必须跳过/自动处理 directory permission/trust，否则进入新 worktree 会卡住；实现时参考最新 CLI help/docs 和 Harbor。

## Goal Mode Instructions

### Objective

在 Goal Mode 中完成 Sidekick MCP 重构，并交付一个可构建、可测试、工具面清晰、符合 MCP authoring best practice 的 TypeScript MCP server。

最终结果应该让主 agent 能：

1. 在配置存在时用 `sidekick_start_task` 异步启动 Claude/Gemini/Codex/OpenCode 子 agent。
2. 按 agent/model 参数选择 runner，默认使用配置文件里的默认 agent/model，减少一次 list models 工具调用。
3. 用 `sidekick_list_models` 查看可用 agent、已配置默认值和模型清单。
4. 用 `sidekick_cleanup_worktree` 显式删除 Sidekick 管理过的 worktree。
5. 在配置缺失时只看到 `sidekick_setup`，并获得一段可执行的 setup prompt。

### Mandatory Operating Rules

- 接手后第一步必须使用 `$handoff`：读取本 thread 下所有 handoff notes，确认已锁定决策、未完成项和阻塞项。
- 实现过程中每完成一个阶段，或发生任何会影响后续实现的设计决定，都要用 `$handoff` 追加记录进度和决策。不要只等到最后才写。
- 按 AGENTS.md 要求，开始实现前创建/更新 `tasks/todo.md`，列出 checkable items；实施过程中持续更新状态。
- 如果用户纠正了实现方向或指出错误，按 AGENTS.md 记录到 `tasks/lessons.md`。
- 允许大力重构；不要为了兼容旧 API 保留复杂分支。
- 保持实现简单。不要引入后台 worker、daemon、durable queue、数据库或复杂调度层，除非测试证明现有 MCP Task 支持无法满足。
- 默认不运行真实模型调用作为自动测试，避免消耗额度或触发不可控外部副作用。真实 CLI smoke test 只做可选手动验证。
- 任何文件编辑用 `apply_patch`；读文件优先用 `rg`、`sed`、`find`。

## 探索指南

### 1. 快速重新建立代码地图

先读这些文件，确认当前实现边界：

- `package.json`：包名、binary、scripts、dependencies。
- `src/index.ts`：server 启动入口。
- `src/serverApp.ts`：MCP server wiring、tool/list/call handlers、Tasks/progress/cancel 逻辑。
- `src/tools/registry.ts`、`src/tools/index.ts`：tool registry 和现有动态注册。
- `src/config.ts`：当前配置加载、env 命名和默认路径。
- `src/execution.ts`、`src/taskStore.ts`：tool context、task cancellation/store。
- `src/utils/*Executor.ts`、`src/tools/ask-*.tool.ts`：旧 per-agent tool 和 CLI 命令构造。
- `src/utils/opencodeCatalog.ts`、`src/modelCatalog.ts`、`src/modelCatalog.generated.json`：模型发现逻辑。
- `tests/serverApp.test.ts`、`tests/tools/initTools.test.ts`、`tests/utils/*Executor.test.ts`：现有测试风格和 mock 方式。

探索时同时记录：

- 哪些模块能保留并重命名。
- 哪些旧工具/帮助工具/分块工具可以直接删除。
- 现有 MCP Tasks 是否能直接支持 `taskSupport: "required"`。
- 当前测试里哪些会因为破坏性工具面变更需要删改。

### 2. 参考 Harbor 的 agent 集成

参考 `/fast/hrz/harbor`，重点读：

- `/fast/hrz/harbor/src/harbor/agents/base.py`
- `/fast/hrz/harbor/src/harbor/agents/factory.py`
- Claude/Codex/Gemini/OpenCode wrapper 相关文件

目标不是搬 Python 架构，而是借鉴这些点：

- runner factory/registry 与工具面解耦。
- agent name、model、flags、cwd/env、prompt 组合成执行上下文。
- 各 CLI 的命令参数按 wrapper 局部维护，避免散落在 tool handler 中。

### 3. 实现时允许搜索互联网

只在需要确认最新 CLI 参数或 MCP SDK 行为时搜索。优先官方来源：

- MCP tools spec：`https://modelcontextprotocol.io/specification/2025-06-18/server/tools`
- MCP client best practices：`https://modelcontextprotocol.io/docs/develop/clients/client-best-practices`
- TypeScript SDK：`https://github.com/modelcontextprotocol/typescript-sdk`
- Claude Code worktrees：`https://code.claude.com/docs/en/worktrees`
- Gemini CLI docs：`https://github.com/google-gemini/gemini-cli/tree/main/docs`
- Codex noninteractive docs：`https://developers.openai.com/codex/noninteractive`
- OpenCode CLI docs：`https://opencode.ai/docs/cli`

特别要确认：

- Gemini 最新跳过 directory trust/permission 的参数；当前已观察到应考虑 `--skip-trust`。
- Gemini `edit` 模式对应 `--approval-mode` 的最佳值：优先 `auto_edit`，必要时允许配置覆盖。
- Claude `--worktree` 与 `--permission-mode` 当前参数名。
- Codex `exec --cd`、`--sandbox`、`--ask-for-approval never` 的当前可用性。
- OpenCode `run --dir`、`--model provider/model`、`--format json` 当前可用性。

## 详细实现计划

### Phase 0 — Plan And Guardrails

- [ ] 使用 `$handoff` 读完 thread 记录。
- [ ] 写/更新 `tasks/todo.md`，列出本计划的阶段和测试项。
- [ ] 运行 `git status --short`，确认除 conversation/tasks 外是否有用户未提交改动；不要回滚用户改动。
- [ ] 运行当前基线测试或至少 `npm run lint`，了解重构前状态。如果基线已失败，记录失败原因。

### Phase 1 — Rename And Package Surface

- [ ] `package.json`：
  - `name` 改为 `@hrz6976/sidekick-mcp`。
  - `description` 改为 Sidekick MCP 语义。
  - `bin` 改为 `{ "sidekick-mcp": "dist/index.js" }`。
  - repository/homepage/bugs 如无新仓库信息，可先移除或改为 neutral，避免继续指向 `osanoai/multicli`。
  - scripts 保持简单：`build`、`start`、`dev`、`test`、`lint`。
- [ ] `package-lock.json` 同步更新。
- [ ] `README.md` 后续按新工具面更新；不需要保留旧 usage。
- [ ] `CHANGELOG.md` 可加 breaking-change note，或在大重构最后统一处理。

### Phase 2 — Config And Sidekick Home

实现新配置模块，建议文件：

- `src/config.ts`
- `src/sidekickHome.ts` 或 `src/runtime/paths.ts`

配置要求：

- 默认 home：`~/.sidekick-mcp`。
- 默认 config：`~/.sidekick-mcp/config.json`。
- env override：`SIDEKICK_MCP_CONFIG_PATH`。
- 不再使用任何 `MULTICLI_*` env。
- 配置缺失时不要抛出致命启动错误；server 应进入 setup-only mode。
- JSON schema 先保持简单，避免新 parser 依赖。

建议 config shape：

```json
{
  "defaultAgent": "codex",
  "defaultModels": {
    "claude": "sonnet",
    "gemini": "gemini-2.5-pro",
    "codex": "gpt-5.1-codex-max",
    "opencode": "github-copilot/claude-sonnet-4.5"
  },
  "agents": {
    "claude": { "enabled": true, "command": "claude", "extraArgs": [] },
    "gemini": { "enabled": true, "command": "gemini", "extraArgs": ["--skip-trust"] },
    "codex": { "enabled": true, "command": "codex", "extraArgs": [] },
    "opencode": { "enabled": true, "command": "opencode", "extraArgs": [] }
  },
  "defaults": {
    "mode": "edit",
    "worktree": "auto"
  }
}
```

不要过早做复杂 per-provider schema。必要的 provider-specific flags 先通过 `extraArgs` 支持。

### Phase 3 — Tool Surface

删除或停止注册旧工具：

- `Ask-Claude`
- `Ask-Gemini`
- `Ask-Codex`
- `Ask-OpenCode`
- `List-*-Models`
- `*-Help`
- `Fetch-Chunk`
- `Claude-Gemini-Codex`/`important-read-now` 这类旧入口

实现新工具：

#### `sidekick_setup`

- setup-only mode 下唯一暴露。
- read-only annotation：`readOnlyHint: true`。
- 返回一段 prompt/template，指导当前 agent：
  - 检查 `claude/gemini/codex/opencode` 是否安装。
  - 检查可用模型。
  - 只用普通 `opencode models`，不要 `--refresh`。
  - 写入 `~/.sidekick-mcp/config.json`。
  - 对 Gemini 启用 worktree/trust 所需设置，或确保 runner 使用 `--skip-trust`。

#### `sidekick_start_task`

- task-only：`execution.taskSupport` 必须是 required 语义；如果 SDK 表达方式不同，以当前 SDK 类型为准。
- annotations：`readOnlyHint: false`，`destructiveHint: false`，`openWorldHint: true`。
- args：
  - `prompt: string`
  - `agent?: "claude" | "gemini" | "codex" | "opencode"`
  - `model?: string`
  - `mode?: "read-only" | "edit" | "full-access"`，默认 `"edit"`
  - `worktree?: "auto" | "off"`，默认 `"auto"`
  - `title?: string`
  - `options?: Record<string, unknown>`，v1 中尽量只透传受控字段，未知字段返回 actionable error
- 返回结果必须包含：
  - task id/status
  - agent/model/mode
  - worktree path 或 native worktree name
  - stdout/stderr/log path
  - final summary/exit status
  - 提醒：“When you are done inspecting or merging this worktree, call `sidekick_cleanup_worktree` with taskId ...”

#### `sidekick_list_models`

- read-only annotation：`readOnlyHint: true`。
- 返回 installed/enabled agents、默认 agent、默认模型、每个 agent 模型列表。
- Claude/Gemini/Codex 可结合静态 catalog 和配置默认值。
- OpenCode 必须调用普通 `opencode models` 或读取已配置 cache；不得使用 `--refresh`。

#### `sidekick_cleanup_worktree`

- destructive annotation：`destructiveHint: true`。
- args 建议只支持：
  - `taskId?: string`
  - `worktreeId?: string`
  - `force?: boolean`
- 不接受任意路径删除，除非该路径能在 Sidekick metadata 中反查到。
- 删除前验证 worktree 属于 Sidekick 管理范围或 CLI native worktree 记录。
- 默认拒绝删除 dirty worktree，除非 `force: true`。
- 返回删除了什么、保留了什么、下一步建议。

### Phase 4 — Runner Registry

新增 runner 层，建议文件：

- `src/runners/types.ts`
- `src/runners/registry.ts`
- `src/runners/claude.ts`
- `src/runners/gemini.ts`
- `src/runners/codex.ts`
- `src/runners/opencode.ts`
- `src/runners/command.ts` 或复用现有 `commandExecutor.ts`

核心接口建议：

```ts
type AgentName = "claude" | "gemini" | "codex" | "opencode";
type SidekickMode = "read-only" | "edit" | "full-access";

interface RunRequest {
  agent: AgentName;
  model: string;
  prompt: string;
  mode: SidekickMode;
  cwd: string;
  env: NodeJS.ProcessEnv;
  worktree?: WorktreeHandle;
  signal?: AbortSignal;
  onProgress?: (chunk: string) => void;
}

interface AgentRunner {
  name: AgentName;
  detect(): Promise<boolean>;
  listModels(): Promise<string[]>;
  run(request: RunRequest): Promise<RunResult>;
}
```

命令构造方向：

- Claude：
  - `claude --print --output-format stream-json --worktree <slug> --model <model> ... -- <prompt>`
  - `read-only`/`edit`/`full-access` 映射到 Claude `--permission-mode`，实现时确认最新参数。
- Gemini：
  - `gemini --prompt <prompt> --model <model> --output-format stream-json --approval-mode=<mode> --worktree <slug> --skip-trust`
  - `edit` 推荐 `auto_edit`；`full-access` 可用 `yolo`，但只在显式 full-access 下。
- Codex：
  - Sidekick managed worktree。
  - `codex exec --json --cd <worktreePath> --model <model> --sandbox <mode> --ask-for-approval never --skip-git-repo-check -- <prompt>`
- OpenCode：
  - Sidekick managed worktree。
  - `opencode run --dir <worktreePath> --model <provider/model> --format json --thinking -- <prompt>`

### Phase 5 — Worktree Manager

新增轻量 worktree manager，建议文件：

- `src/worktrees/types.ts`
- `src/worktrees/manager.ts`

职责：

- 为 task 生成 slug：`sidekick-<taskId-short>-<agent>`。
- 检测当前 cwd 是否在 git repo 中。
- `worktree: "auto"` 且 mode 不是 `read-only` 时创建/使用 worktree。
- Claude/Gemini native worktree：
  - 记录 native worktree name 和 base cwd。
  - 不手动创建路径，除非 CLI docs 要求。
- Codex/OpenCode managed worktree：
  - 在 `~/.sidekick-mcp/worktrees/<repoHash>/<slug>` 创建 git worktree。
  - 记录 base repo、base ref、branch/name、path、taskId、agent。
- `worktree: "off"` 时在原 cwd 跑，但只应允许 `read-only` 或明确 full-access；默认 edit 不建议 off。
- cleanup：
  - 只清理 metadata 里记录过的 worktree。
  - managed worktree 用 `git worktree remove`。
  - dirty 时默认拒绝，提示 `force: true`。
  - native Claude/Gemini cleanup 若 CLI 没有可靠 delete 命令，可返回具体路径/命令建议，或只清理 Sidekick metadata；实现时按 CLI 能力验证。

### Phase 6 — Task Metadata And Logs

新增轻量 task runtime metadata，建议文件：

- `src/tasks/metadataStore.ts`
- `src/tasks/types.ts`

目录：

- `~/.sidekick-mcp/tasks/<taskId>/metadata.json`
- `~/.sidekick-mcp/tasks/<taskId>/stdout.log`
- `~/.sidekick-mcp/tasks/<taskId>/stderr.log`
- `~/.sidekick-mcp/tasks/<taskId>/result.json`

行为：

- task start：写 metadata `status: "running"`。
- progress：追加 stdout/stderr 或 combined log。
- completion：写 `status: "completed"` 和 result。
- failure：写 `status: "failed"`，包含 exitCode/stderr/actionable message。
- cancellation：abort child process，写 `status: "cancelled"`。
- server startup：扫描 `running` metadata，改成 `interrupted`，保留 logs/worktree。

### Phase 7 — Server Wiring

在 `src/serverApp.ts` 或重构后的 server 文件中：

- server name/version 改为 Sidekick。
- 初始化时加载 config：
  - missing config：注册 only `sidekick_setup`。
  - valid config：注册 `sidekick_start_task`、`sidekick_list_models`、`sidekick_cleanup_worktree`。
- 保留 MCP Tasks、progress、cancel 支持。
- 移除旧 clientFilter 中按 Claude/Gemini/Codex 隐藏工具的逻辑，或改成对新 sidekick tools 无影响。
- 错误应作为 tool result 返回，包含可执行下一步，不要直接让协议 handler 崩掉。

### Phase 8 — Docs And Cleanup

- 更新 README：
  - 新名字、安装方式、MCP config 示例。
  - `~/.sidekick-mcp/config.json` 示例。
  - 三个主流程：setup、start task、cleanup worktree。
  - OpenCode model 注意事项：只读已配置模型，不刷新 provider catalog。
  - Gemini `--skip-trust`/worktree 注意事项。
- 更新 CHANGELOG：记录 breaking rewrite。
- 删除明显不再使用的旧文件和旧测试。
- 清理 `src/modelCatalog.generated.json` 的角色：如仍用于 Claude/Gemini/Codex 静态模型保留；如果不再需要，删除脚本和测试。

## 测试方法

### Unit Tests

必须覆盖：

- Config:
  - 缺失 config 时进入 setup-only mode。
  - 默认路径为 `~/.sidekick-mcp/config.json`。
  - `SIDEKICK_MCP_CONFIG_PATH` override 生效。
  - 不再读取 `MULTICLI_*`。
- Tool registry:
  - setup-only mode 只列 `sidekick_setup`。
  - configured mode 只列 `sidekick_start_task`、`sidekick_list_models`、`sidekick_cleanup_worktree`。
  - tool names 为 snake_case，annotations 正确。
- Runner command construction:
  - Claude 带 `--print`、`--output-format stream-json`、`--worktree`、`--model`。
  - Gemini 带 `--skip-trust`，edit mode 不应默认 yolo/full-access。
  - Codex 使用 `exec --json --cd <worktreePath>`。
  - OpenCode 使用 `run --dir <worktreePath> --model provider/model --format json`。
- Model listing:
  - OpenCode 不调用 `--refresh`。
  - 配置默认模型在返回结构中出现。
- Worktree manager:
  - managed worktree path 在 `~/.sidekick-mcp/worktrees/...`。
  - 非 git repo 的错误 actionable。
  - cleanup 只接受 Sidekick metadata 中存在的 task/worktree。
  - dirty worktree 默认拒绝删除，`force` 时允许。
- Task metadata:
  - start/completed/failed/cancelled/interrupted 状态落盘。
  - startup 将旧 running 改为 interrupted。
  - final result 包含 cleanup hint。

### Integration-Style Tests With Mocks

用 fake command executor/mock child process，不调用真实模型：

- `sidekick_start_task` 能创建 task、写 metadata、发 progress、返回最终 result。
- cancellation 能 abort 子进程并写 cancelled。
- runner 失败时返回 tool result error，包含 stderr/log path。
- setup-only mode 下调用非 setup tool 应不可见或返回 unknown。

### Manual Smoke Tests

只在用户允许或确认可消耗 CLI/API 时执行：

- `npm run build`
- 用 MCP Inspector 或本地 stdio client 检查 tool list。
- 临时移动/设置空 config，确认只暴露 `sidekick_setup`。
- 写最小 config 后确认列出三个 sidekick tools。
- 可选真实 prompt：让某个 agent 在临时 repo/worktree 中创建一个小文件，确认 result 提供 worktree 和 cleanup hint。
- 调用 `sidekick_cleanup_worktree` 清理该 task worktree。

### Required Verification Commands

最终至少运行：

```bash
npm run lint
npm test
npm run build
```

如果任何命令失败：

- 不要假装完成。
- 记录失败命令、核心错误、已修复/未修复状态。
- 若失败由环境缺少真实 CLI/API 导致，说明 mock 测试已覆盖哪些部分。

## 验收指标

### Functional Acceptance

- `package.json` 显示 `@hrz6976/sidekick-mcp`，binary 为 `sidekick-mcp`。
- MCP server 名称/日志 bindings 不再使用 Multi-CLI 作为主要身份。
- 配置缺失时 tool list 只有 `sidekick_setup`。
- 配置存在时 tool list 只有目标工具集：`sidekick_start_task`、`sidekick_list_models`、`sidekick_cleanup_worktree`，以及是否保留 `sidekick_setup` 可按实现选择；若保留，也必须是只读辅助工具。
- `sidekick_start_task` 是 task-first/task-only，不走长时间同步阻塞。
- 默认 `mode` 为 `edit`。
- Gemini runner 包含跳过 directory permission/trust 的处理。
- OpenCode 模型发现不使用 `--refresh`。
- 任务结果包含 worktree 信息、log 路径和 cleanup 提醒。
- cleanup tool 不接受任意路径删除。

### Quality Acceptance

- 旧 per-agent tool surface 被删除或完全停止注册。
- runner 与 tool handler 解耦，新增/修改 agent 不需要改 MCP handler 主流程。
- 配置、runner、worktree、task metadata 各自边界清楚。
- 错误消息 actionable，告诉主 agent 下一步怎么修。
- 没有引入复杂后台系统。
- 没有无关格式化或大规模无意义 churn。

### Test Acceptance

- 新增/更新测试覆盖核心新行为。
- `npm run lint` 通过。
- `npm test` 通过。
- `npm run build` 通过。
- 如无法跑某个验证，最终回复必须说明原因和剩余风险。

## 当前状态

本次只新增 Goal Mode instructions，没有改源码。

| 文件 | 变更描述 |
| ---- | -------- |
| `conversations/2026-06-03-agent-task-mcp/032029-codex-drafted-goal-mode.md` | 新增 Goal Mode 接手执行说明、探索指南、实现计划、测试方法和验收指标 |

## 下一个 Agent 的待办事项

1. 使用 `$handoff` 读取本 thread 所有记录，特别是本文件。
2. 创建/更新 `tasks/todo.md`，把 Phase 0-8 拆成 checklist。
3. 开始 Phase 0/1，实现前先确认当前 git 状态和基线验证。
4. 实现过程中每完成一个阶段就追加 handoff 记录。

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| Goal Mode 执行前必须读 handoff | 避免丢失已锁定的 breaking-change 决策 |
| Goal Mode 执行中也要记录 handoff | 用户明确要求运行时用 handoff skill 记录进度和决策 |
| 测试默认 mock CLI，不默认调用真实 agent | 避免消耗额度和不可控外部副作用 |
| 以阶段验收而不是一次性大爆改验收 | 大重构需要中间可验证状态，方便中断和接手 |

## 阻塞项

- 无。provider-specific options 可按最小方案实现，必要时再扩展配置文件 `extraArgs`。

## 建议下一步

一句话：Goal Mode 接手后先读 handoff、写 `tasks/todo.md`，再从 package rename 和 config/setup-only mode 开始实现。
