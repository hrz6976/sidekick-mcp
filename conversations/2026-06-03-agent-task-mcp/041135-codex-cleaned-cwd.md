# 交接记录 — 041135 · codex · cleaned-cwd

## 继承的上下文

已读取本 thread 的既有交接记录，尤其是：

- `conversations/2026-06-03-agent-task-mcp/041033-codex-verified-four-agents.md`
- `conversations/2026-06-03-agent-task-mcp/041058-codex-refactored-ask-tools.md`

当前最新 public contract 已锁定为：缺配置只暴露 `setup`；配置存在时暴露 `ask_<agent>`、`list_agents`、`cleanup_worktree`。`agents` 是用户可配置的 helper-agent map，`runner` 是内部 CLI：`claude`、`gemini`、`codex`、`opencode`。

本次用户确认：不需要在 `ask_<agent>` 工具参数中保留显式 `cwd`。Sidekick 应依赖 MCP client roots；如果 client 不支持 roots，则依赖 MCP server 启动目录。此前调研确认：

- Gemini CLI 支持 MCP roots。
- Claude Code 官方文档确认支持 `roots/list`。
- Codex CLI 和 OpenCode 不一定提供 MCP roots，但都能以项目目录启动本地 MCP server；Codex 配置支持 MCP server `cwd`，OpenCode 本地 MCP server 使用 instance directory 作为启动 cwd。

## 本次完成的工作

- [x] 删除 `src/tools/sidekick.ts` 中未完成的 public `cwd` 参数。
- [x] 删除 `resolveBaseCwd` 及其 `fs.stat` / `path.resolve` 目录校验逻辑。
- [x] 更新 setup prompt 和 ask tool/prompt descriptions，不再引导 agent 传 `cwd`。
- [x] 保留内部执行根目录逻辑：`context.cwd ?? process.cwd()`。
- [x] 从 ask result 顶层删除 `cwd` 字段；worktree 对象仍保留实际运行目录。
- [x] 更新 `tasks/todo.md` 的 cleanup checklist 和验证结果。

## 当前状态

| 文件 | 变更描述 |
| ---- | -------- |
| `src/tools/sidekick.ts` | 移除 public `cwd` 输入；提示文案改为依赖 MCP roots / server launch directory |
| `tasks/todo.md` | 新增并完成 `Cwd Parameter Cleanup` review/results |
| `tasks/lessons.md` | 已记录：添加 MCP 工具 cwd 参数前应先验证 client roots/server cwd 行为 |

## 验证结果

已通过：

- `npm run lint`
- `npm test`：12 files / 98 tests
- `npm run test:e2e`：`SIDEKICK_E2E_OK`
- `npm run build`

## 下一个 Agent 的待办事项

1. 如果继续修改 docs，请保持 `ask_<agent>` schema 不包含 `cwd`。
2. 如果用户要求再次验证真实模型，可运行 `npm run test:e2e:real:all`，但这会消耗本机已登录 CLI/model 额度。
3. 如果提交/PR，commit/PR 文案按仓库要求包含 “Claude, Codex, and Gemini” authorship reference。

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| 不暴露 `cwd` 参数 | 避免扩大 `ask_<agent>` API 面；正常客户端用 roots，Codex/OpenCode 可通过 MCP server 启动目录解决 |
| 保留 `context.cwd ?? process.cwd()` | 这是 Sidekick 使用 roots 和 server launch cwd fallback 的核心路径 |
| 删除 ask result 顶层 `cwd` | public result 不再暗示调用方可设置 cwd；实际运行目录仍可从 `worktree.cwd` 查看 |

## 阻塞项

- 无。

## 建议下一步

一句话：继续保持工具 API 简洁；如遇目录错误，优先检查 MCP client roots 或 MCP server 配置/启动目录，而不是重新加入 `cwd` 参数。
