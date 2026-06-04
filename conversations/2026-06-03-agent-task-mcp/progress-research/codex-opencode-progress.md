# Codex / OpenCode JSON progress 调研

日期：2026-06-04

## 1. 资料来源

本地命令：

- `codex exec --help`：确认 `--json` 会向 stdout 输出 JSONL events。
- `opencode run --help`：确认 `--format json` 是 raw JSON events。

GitHub 源码：

- `openai/codex`：`codex-rs/exec/src/exec_events.rs`，定义 `codex exec --json` 顶层事件。
- `anomalyco/opencode`：`packages/opencode/src/cli/cmd/run.ts`，定义 `opencode run --format json` 的 `emit(type, data)` 和事件筛选。

## 2. Codex event 字段 / 示例

当前 Codex JSONL 使用顶层 `type` 字段：

- `thread.started`: `{ type, thread_id }`
- `turn.started`: `{ type }`
- `turn.completed`: `{ type, usage }`
- `turn.failed`: `{ type, error }`
- `error`: `{ type, message }`
- `item.started` / `item.updated` / `item.completed`: `{ type, item }`

`item` 通过 `item.type` 区分：

- `agent_message`: `{ id, type, text }`
- `reasoning`: `{ id, type, text }`
- `command_execution`: `{ id, type, command, aggregated_output, exit_code, status }`
- `file_change`: `{ id, type, changes, status }`
- `mcp_tool_call`: `{ id, type, server, tool, arguments, result, error, status }`
- `web_search`: `{ id, type, query, action }`
- `todo_list`: `{ id, type, items }`
- `error`: `{ id, type, message }`

兼容性：早期/SDK 文档里也可能出现 `{ msg: { type: ... } }` 或 `method: "item/agentMessage/delta"` 形态。renderer 应宽松兼容。

## 3. OpenCode event 字段 / 示例

`anomalyco/opencode` 的 `run.ts` 中，`--format json` 会写：

```json
{"type":"text","timestamp":...,"sessionID":"...","part":{...}}
```

主要事件来自 `message.part.updated`：

- `step_start`: `{ type, timestamp, sessionID, part }`
- `step_finish`: `{ type, timestamp, sessionID, part }`
- `tool_use`: `{ type, timestamp, sessionID, part }`，当 `part.type === "tool"` 且状态 completed/error 时发出。
- `text`: `{ type, timestamp, sessionID, part }`，当 `part.type === "text"` 且 `part.time.end` 时发出。
- `reasoning`: `{ type, timestamp, sessionID, part }`，当 `part.type === "reasoning"`、`part.time.end` 且 `--thinking` 时发出。
- `error`: `{ type, timestamp, sessionID, error }`，来自 `session.error` 或 prompt/command API error。

重要细节：OpenCode 的 JSON event 是“完成后”事件，不一定是 token-level delta。适合显示 step/tool/text/reasoning 摘要。

## 4. Renderer 建议

Codex：

- `thread.started` / `turn.started`：短状态即可。
- `agent_message`：展示 `Codex: <text preview>`。
- `reasoning`：展示 `Codex reasoning: <preview>`，可被节流。
- `command_execution`：started/updated 显示 `Codex running command: <command>`；completed 显示完成/失败和 exit code。
- `file_change`：显示文件数量和最多前三个路径。
- `mcp_tool_call`：显示 server.tool 和 status。
- `web_search`：显示 query 摘要。
- `todo_list`：显示完成计数。
- `turn.completed`：显示 token usage 摘要。

OpenCode：

- `step_start` / `step_finish`：短状态。
- `tool_use`：显示 `OpenCode used <tool>` 或 `OpenCode tool failed: <tool>`。
- `text`：显示 `OpenCode: <preview>`。
- `reasoning`：显示 `OpenCode reasoning: <preview>`。
- `error`：尽量取 `error.data.message` / `error.message` / `error.name`。

## 5. 风险 / 未知

- Codex event schema 正在演进；当前源码是 `thread.*` / `item.*`，旧 SDK/示例可能是 `msg` 或 `method`。
- OpenCode `part` 的内部字段随 SDK v2 变化，应只取 `part.tool`、`part.text`、`part.state.status` 这类稳定字段。
- 两者都可能输出大段文本或命令输出，progress 必须截断。
