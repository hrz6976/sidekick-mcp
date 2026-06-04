# 交接记录 — 032013 · codex · researched-agent-mcp

## 继承的上下文

当前仓库原本没有 `conversations/` 目录，因此本次创建新线程：
`conversations/2026-06-03-agent-task-mcp/`。

用户目标：把 Multi-CLI 从“每个 agent 一个 ask tool、普通 tool call 容易阻塞、模型选择必须先 list”的形态，重构为一个更简洁的 ask-other-agent MCP server。目标只支持 Claude/Gemini/Codex/OpenCode 最新版本，可以要求 MCP Tasks，不需要兼容旧客户端的同步长调用。

已锁定的关键方向：

- 项目重命名为 Sidekick，npm package 使用 `@hrz6976/sidekick-mcp`，binary 使用 `sidekick-mcp`。
- 与旧 `@osanoai/multicli` / `multicli` / `Ask-Claude` 等工具面彻底断开，不保留兼容 alias。
- MCP 长程任务采用 Task-first/Task-only 设计，而不是继续加大同步 tool timeout。
- Tool 面收敛为一个统一 `Ask-Agent`，agent/model 作为参数，底层 runner 与 tool 解耦。
- 保留模型查询接口；OpenCode 只读取已配置 provider 的模型，不能触发远程大 catalog refresh。
- 配置文件缺失时，MCP 只暴露 `sidekick_setup`，返回用于生成配置文件的 prompt/template，引导当前 agent 完成 setup。
- Worktree 策略采用 Hybrid：Claude/Gemini 优先使用 CLI 原生 worktree；Codex/OpenCode 由 Sidekick 创建 git worktree 后指定运行目录。
- Worktree 默认保留，任务结果提醒主 agent 可在确认不再需要后调用 `sidekick_cleanup_worktree` 做 GC；Sidekick 只暴露受控删除接口，不自动猜测何时清理。
- Task persistence 采用轻量实现：metadata/log/worktree 记录落盘，但不做 server 重启后的子进程恢复；启动时把旧 running task 标记为 interrupted，保留 logs/worktree 供查看或清理。
- Sidekick home 使用 `~/.sidekick-mcp`，配置和临时/运行时文件都放在这里；可保留 env override 但不再使用任何 `MULTICLI_*` 命名。
- 默认权限模式使用 `edit`；子 agent 在独立 worktree 内可改文件，`read-only` / `full-access` 由调用方显式覆盖。
- Gemini runner 实现时需要跳过/自动处理 directory permission，否则进入新 worktree 目录会卡住；可参考 Harbor 源码并按需搜索最新 CLI 参数。

## 本次完成的工作

- [x] 调研 MCP Tasks、progress、cancel 的长任务实践，结论是 Ask 类长任务应走 MCP Tasks。
- [x] 调研当前仓库实现，确认已有 `execution.taskSupport: optional`、`ManagedTaskStore`、progress reporter、task cancellation 和同步 fallback。
- [x] 调研 Harbor `/fast/hrz/harbor` 的 agent 集成方式，主要借鉴 `AgentFactory`、installed agent wrapper、`agent name + model_name + flags/env + run context` 解耦。
- [x] 调研四个 CLI 的非交互与 worktree 能力。
- [x] 形成 v2 计划：Task-only `Ask-Agent` + `List-Agent-Models` + missing-config setup prompt + Hybrid worktree。
- [x] 通过 `$grill-me` 锁定破坏性重构、项目命名和旧包断开策略。
- [x] 通过 `$grill-me` 锁定 worktree 清理策略：默认保留，提供显式 cleanup tool。
- [x] 通过 `$grill-me` 锁定 task persistence 策略：轻量落盘记录，不做 durable queue/daemon/restart resume。
- [x] 通过 `$grill-me` 锁定 Sidekick home/config 路径：`~/.sidekick-mcp`。
- [x] 通过 `$grill-me` 锁定默认权限模式：`edit`。
- [ ] 还未实现代码。
- [ ] 还需继续用 `$grill-me` 逐个锁定不清楚的产品/兼容性决策，或在实现时按最简单方案收敛。

## 当前状态

本次只写入交接记录，没有修改源码。

| 文件 | 变更描述 |
| ---- | -------- |
| conversations/2026-06-03-agent-task-mcp/032013-codex-researched-agent-mcp.md | 保存 v2 实现计划、调研结论、待追问问题 |

运行过的关键只读命令/观察：

- `claude --version`：本机 Claude Code 为 `2.1.152`，`claude --help` 显示支持 `--worktree [name]`、`--print`、`--output-format text/json/stream-json`、`--permission-mode`、`--model`。
- `gemini --version`：本机 Gemini CLI 为 `0.45.0`，`gemini --help` 显示支持 `--prompt`、`--model`、`--output-format text/json/stream-json`、`--worktree`、`--approval-mode`。
- Gemini 随包文档 `docs/cli/git-worktrees.md` 说明：必须启用 `experimental.worktrees: true`；`--worktree name` 会创建 `.gemini/worktrees/name`，且 Gemini 不自动清理 worktree。
- `codex --version`：本机 Codex CLI 为 `0.136.0`，`codex exec --help` 显示支持 `--json`、`--cd <DIR>`、`--model`、`--sandbox`、`--ask-for-approval`、`--skip-git-repo-check`，但未显示原生 `--worktree`。
- `opencode --version`：本机 OpenCode 为 `1.3.17`，`opencode run --help` 显示支持 `--dir`、`--model provider/model`、`--format json`、`--thinking`，但未显示原生 `--worktree`。
- `opencode models` 在本机只输出已配置/已登录 provider 的模型；`opencode models --help` 显示 `--refresh` 会刷新远端 cache，计划中明确不要使用。

## 下一个 Agent 的待办事项

1. 实现前写 `tasks/todo.md`，按 AGENTS.md 跟踪任务。
2. 根据锁定结果写 `tasks/todo.md`，然后开始实现。
3. 先做配置层和统一 tool surface，再做 runner registry，最后改 task runtime 和 worktree manager。
4. 更新测试：配置缺失、任务必需、runner 命令构造、OpenCode 模型发现、worktree 创建/保留/清理、取消和进度。
5. 验证：`npm run lint`、`npm test`、`npm run build`。

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| Ask 类调用改为 task-only | 用户明确只需支持最新主流 agent；MCP 长任务 best practice 是 Task handle，不是长阻塞 tool call |
| 统一为 `Ask-Agent` | 当前每个 agent 一个 tool 导致 tool surface 僵硬且复杂；agent/model 应是参数 |
| 底层 runner 与 tool 解耦 | 借鉴 Harbor 的 AgentFactory/installed agent wrapper，便于维护 CLI 差异 |
| Hybrid worktree | Claude/Gemini 已有原生 `--worktree`；Codex/OpenCode 当前版本没有等价能力，但可由 Multi-CLI 创建 worktree 后用 `--cd`/`--dir` 运行 |
| OpenCode 模型只用普通 `opencode models` | 用户特别指出不要列出大量不可调用 provider；本机验证普通命令只列已配置 provider，`--refresh` 才会刷新远端 cache |
| 配置缺失时返回 setup prompt | 用户希望 MCP 返回生成配置的 prompt，而不是失败或继续强猜默认值 |
| 项目/包名改为 Sidekick / `@hrz6976/sidekick-mcp` | 用户觉得 Sidekick 简短生动，且明确希望新包名为 `@hrz6976/sidekick-mcp` |
| 不保留旧包和旧工具兼容 | 用户明确允许大力重构并彻底断开旧 `multicli` |
| 配置缺失时只暴露 `sidekick_setup` | 避免 `start_task` 在缺少默认 agent/model 时诱导模型乱试；setup prompt 一次性引导生成配置 |
| 暴露 `sidekick_cleanup_worktree`，默认不自动删 worktree | 主 agent 最清楚何时不再需要结果；任务返回时只提醒可手动 GC，避免删除用户仍要 inspect/merge 的改动 |
| Task persistence 保持轻量 | 用户明确不希望实现太复杂；metadata/log/worktree 落盘即可，running task 不做重启续跑 |
| Sidekick home 用 `~/.sidekick-mcp` | 用户希望配置和临时文件都放这里；新项目不再继承 `MULTICLI_*` 路径/命名 |
| 默认权限模式为 `edit` | 用户确认默认给 edit；长程非 readonly 任务可在独立 worktree 内修改文件 |
| Gemini 需要跳过 directory permission | 用户提醒 Gemini 到新目录默认会卡住；runner 实现需参考 Harbor/最新 CLI 参数处理 |

## 阻塞项

- provider-specific options 的开放程度可先按最小方案实现：只暴露必要通用参数，agent-specific flags 留给配置文件覆盖。

## 建议下一步

一句话：写 `tasks/todo.md` 后开始实现，保留最小 provider-specific options。

## 已形成的实现计划快照

### Public Interface

- Project/MCP display name：`Sidekick`。
- npm package：`@hrz6976/sidekick-mcp`。
- Binary：`sidekick-mcp`。
- Tool names 按 MCP best practice 使用 snake_case、动词开头、服务前缀：`sidekick_start_task`、`sidekick_list_models`、`sidekick_cleanup_worktree`、`sidekick_setup`。
- `sidekick_start_task` args：`prompt` 必填；`agent?: "claude" | "gemini" | "codex" | "opencode"`；`model?: string`；`mode?: "read-only" | "edit" | "full-access"` 默认 `"edit"`；`worktree?: "auto" | "off"` 默认 `"auto"`；`title?: string`；provider-specific `options?: object`。
- `sidekick_list_models` 返回 installed agents、配置默认值、可用模型。OpenCode 只能调用普通 `opencode models`，不能 `--refresh`。
- `sidekick_cleanup_worktree` 删除 Sidekick 已知 task/worktree 对应的工作树；应只接受 `taskId` 或 Sidekick 记录过的 worktree id/path，并拒绝任意路径删除。
- Sidekick home：`~/.sidekick-mcp`。
- 配置文件默认路径：`~/.sidekick-mcp/config.json`，JSON 格式，避免新增 parser 依赖；可选 env override 建议命名为 `SIDEKICK_MCP_CONFIG_PATH`。
- Runtime 路径建议：`~/.sidekick-mcp/tasks/<taskId>/`、`~/.sidekick-mcp/worktrees/`、`~/.sidekick-mcp/logs/` 或每 task 自带 logs。
- 配置缺失时只暴露 `sidekick_setup`；隐藏 `sidekick_start_task` 和 `sidekick_list_models`，由 setup prompt 引导 agent 生成配置并启用 Gemini worktree。

### Runner Commands

- Claude：`claude --print --output-format stream-json --worktree <slug> --model <model> ... -- <prompt>`。
- Gemini：`gemini --prompt <prompt> --model <model> --output-format stream-json --approval-mode=yolo --worktree <slug>`；需预检 `experimental.worktrees: true`，并跳过/自动处理 directory permission（实现时参考 Harbor 和最新 Gemini CLI 参数）。
- Codex：Sidekick 创建 managed git worktree，再运行 `codex exec --json --cd <worktreePath> --model <model> --sandbox <mode> --ask-for-approval never --skip-git-repo-check -- <prompt>`。
- OpenCode：Sidekick 创建 managed git worktree，再运行 `opencode run --dir <worktreePath> --model <provider/model> --format json --thinking -- <prompt>`。

### Task Runtime

- 复用现有 MCP Task 支持，但把 Ask 类工具声明为 `taskSupport: "required"`。
- per-task metadata/logs 放在 `~/.sidekick-mcp/tasks/<taskId>/`。
- server 重启不恢复正在运行的子进程；启动时把旧 running task 标记为 `interrupted`，继续保留 logs/worktree。
- task final result 包含：agent、model、status、final message、worktree path、cleanup tool hint、stdout/stderr/log paths、base ref，并明确提醒主 agent 可在确认不需要后调用 `sidekick_cleanup_worktree` 做 GC。
- cancellation abort 子进程；如果 worktree 有变更则默认保留。

### Test Plan

- 配置加载与缺失 prompt。
- 统一工具 schema 和 task-required 行为。
- 四个 runner 的命令构造。
- OpenCode 模型发现不使用 `--refresh`。
- Worktree manager 的 clean/dirty/non-git/cancel scenarios。
- `npm run lint`、`npm test`、`npm run build`。
