# 交接记录 — 032053 · codex · complete-sidekick

## 继承的上下文

继承并读取：

- `conversations/2026-06-03-agent-task-mcp/032013-codex-researched-agent-mcp.md`
- `conversations/2026-06-03-agent-task-mcp/032029-codex-drafted-goal-mode.md`
- `conversations/2026-06-03-agent-task-mcp/032040-codex-refactored-sidekick.md`

已锁定目标全部保持：Sidekick MCP、`@hrz6976/sidekick-mcp`、binary `sidekick-mcp`、配置 `~/.sidekick-mcp/config.json`、缺配置只暴露 `sidekick_setup`、有配置只暴露 `sidekick_start_task` / `sidekick_list_models` / `sidekick_cleanup_worktree`。

## 本次完成的工作

- [x] 完成 Sidekick package rename、binary rename、README/CHANGELOG/install/security 文档更新。
- [x] 重写 config：`~/.sidekick-mcp`、`SIDEKICK_MCP_CONFIG_PATH`、`SIDEKICK_MCP_*` env，旧 `MULTICLI_*` 不再控制配置。
- [x] 新增 Sidekick tool surface，并删除旧 per-agent tool 源文件。
- [x] 新增 runner registry：Claude/Gemini/Codex/OpenCode 命令构造，Gemini 包含 `--skip-trust`，OpenCode list models 不使用 `--refresh`。
- [x] 新增 task metadata store 和 worktree manager。
- [x] cleanup 支持按 `taskId` 或 `worktreeId` 查 Sidekick metadata，拒绝任意路径，dirty managed worktree 默认拒绝。
- [x] server wiring 改为 Sidekick identity，保留 MCP Tasks/progress/cancel plumbing，`sidekick_start_task` 为 `taskSupport: required`。
- [x] 更新 service helper 的公开名称、service label、env file。
- [x] 更新/新增测试覆盖 config、tool registry、server task flow、HTTP、runners、metadata、worktree guard。
- [x] `tasks/todo.md` 已填完 review/results。

## 当前状态

| 文件 | 变更描述 |
| ---- | -------- |
| `package.json`, `package-lock.json` | Sidekick package/binary/metadata |
| `src/config.ts` | Sidekick config/home/env loader |
| `src/tools/sidekick.ts` | 四个 public Sidekick tools |
| `src/runners/*` | runner registry 和命令构造 |
| `src/tasks/metadataStore.ts` | 任务 metadata/log/result 落盘 |
| `src/worktrees/manager.ts` | native/managed worktree 创建和 cleanup |
| `src/serverApp.ts` | Sidekick identity、tool list、task-required enforcement |
| `src/service/*` | Sidekick service labels/env/messages |
| `README.md`, `CHANGELOG.md`, `install.sh`, `SECURITY.md` | Sidekick docs/install/security |
| `tests/*` | 新 contract 测试 |

验证已通过：

- `npm run lint`
- `npm test`：24 files / 317 tests
- `npm run build`
- built smoke check：
  - missing config -> `sidekick_setup`
  - minimal config -> `sidekick_start_task,sidekick_list_models,sidekick_cleanup_worktree`

额外检查：

- `rg "Multi-CLI|@osanoai|Ask-|List-.*-Models|Fetch-Chunk|Claude-Gemini-Codex|multicli" src README.md CHANGELOG.md package.json package-lock.json install.sh SECURITY.md` 无结果。

## 下一个 Agent 的待办事项

1. 如果要发布 PR，按仓库要求 commit/PR 文案包含 “Claude, Codex, and Gemini” authorship reference。
2. 可选：真实 CLI smoke test 需用户明确允许，因为会调用真实模型/CLI。
3. 可选：进一步精简仍存在但不再 public 的旧 utils/model catalog 文件。

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| 删除旧 tool 源文件 | 避免旧 tool surface 在源码中继续出现，满足 breaking rewrite |
| 保留 MCP task plumbing | 已有 SDK task/progress/cancel 支持可用，无需 daemon/queue |
| service helper 改 Sidekick 但保留机制 | 不扩大范围重写 service installer 架构 |
| 真实模型 smoke test 不自动执行 | 避免额度消耗和不可控外部副作用 |

## 阻塞项

- 无。

## 建议下一步

一句话：可以进入人工 review/PR 阶段；如需真实 agent 验证，先让用户确认允许消耗 CLI/API。
