# 交接记录 — 041345 · codex · researched-concurrency

## 继承的上下文

继承 `conversations/2026-06-03-agent-task-mcp/121032-codex-mcp-tasks-optional-fallback.md` 与 `041332-codex-complete-progress.md`：Sidekick 的 `ask_<agent>` 工具需要兼容普通 `tools/call`，不能假设 Claude Code/OpenCode 都会使用 MCP Tasks。当前实现已经把 task support 改成 optional，并通过 `notifications/progress` 透传 CLI JSONL progress。

## 本次完成的工作

- [x] 将 `yasasbanukaofficial/claude-code` 克隆到外部源码临时目录。
- [x] 调研该 Claude Code 源码的 MCP tool 调用路径。
- [x] 调研 MCP 基础协议、progress、cancellation 与 TypeScript SDK 的非 task 请求行为。
- [x] 给出无 MCP Tasks 时支持多个长程任务的设计结论。

## 当前状态

| 文件或目录 | 状态 |
| ---------- | ---- |
| `/fast/hrz/tmp-sources/yasasbanukaofficial-claude-code` | 新克隆的 Claude Code 源码，remote 为 `https://github.com/yasasbanukaofficial/claude-code.git`，HEAD 为 `a371abbe75ffa0d0a3c92290e2bbf56a7ef54367` |
| `src/serverApp.ts` | 已检查：普通 callTool 路径同步等待最终结果；task 参数路径会立刻返回 task handle |
| `src/tools/sidekick.ts` | 已检查：每次 ask 生成独立 taskId/worktree/metadata/subprocess，没有显式全局串行队列 |
| `src/utils/commandExecutor.ts` | 已检查：每次执行 spawn 独立 subprocess，支持 AbortSignal 取消 |

## 关键发现

- Claude Code 源码中 MCP tool 仍走普通 `client.callTool(...)`，不是必须使用 `experimental.tasks.callToolStream(...)`。
- 该实现给 MCP tool call 设置了接近无限的默认 timeout：`DEFAULT_MCP_TOOL_TIMEOUT_MS = 100_000_000`，并通过 SDK `onprogress` 接收 progress。
- MCP 基础协议基于 JSON-RPC request id；同一 session 中多个 active request 可以通过不同 id 对应不同 response。
- MCP progress 使用 request `_meta.progressToken`，token 必须在 active request 中唯一；progress notification 只应引用还在进行中的请求。
- TypeScript SDK 对普通请求会为每个 request 分配 message id，并用 `_responseHandlers` / `_progressHandlers` map 匹配 response 与 progress；这支持多个 in-flight request。
- SDK 支持 `resetTimeoutOnProgress`，但客户端必须显式启用；否则 progress 不一定延长普通 call 的 request timeout。
- MCP cancellation 是 `notifications/cancelled`，按 request id 取消；服务器 handler 需要尊重 `extra.signal` 并清理 subprocess。

## 设计结论

| 方案 | 兼容性 | 代价 |
| ---- | ------ | ---- |
| 普通 `tools/call` 长等待 + progress | 对 Claude Code 这类长 timeout 客户端可行；协议层支持多个 in-flight request | 客户端必须并发发起调用并设置足够 timeout；断连/超时后无法 fetch later |
| MCP Tasks | 语义最准确：call-now/fetch-later/status/result/cancel | 当前主流客户端工具调用路径支持不稳定；OpenCode/Claude 实测未必走 Tasks |
| 应用层 job tools：`start_run`/`get_run`/`list_runs`/`cancel_run` | 最通用，不依赖 MCP Tasks；短 timeout 客户端也可用 | 增加 tool call；需要 prompt 引导 agent poll |
| 每次启动独立 MCP server/session | 可降低服务端资源耦合 | 不解决单次 tool timeout 与结果交付问题 |

## 推荐下一步

1. 保留当前 `ask_<agent>` 普通长调用路径，作为 Claude Code/Cursor 等长 timeout 客户端的最佳体验。
2. 对 OpenCode 这类默认短 timeout 客户端，文档上先要求把 MCP server timeout 提高到 120s/300s。
3. 如果要真正跨客户端支持“多个长程任务”，新增普通工具级 job API，而不是只依赖 MCP Tasks：
   - `start_<agent>` 或 `start_run`：快速返回 `{ runId, taskId, status }`。
   - `get_run`：读取当前状态、stdout tail、stderr tail、最终结果路径/摘要。
   - `list_runs`：列出 running/completed/failed runs。
   - `cancel_run`：AbortSignal/kill subprocess。
4. `ask_<agent>` 可继续保留为同步便利工具；`start_*` 是兼容短 timeout 客户端的 escape hatch。

## 阻塞项

- 无。

## 建议下一步

一句话：若继续实现，优先设计应用层 job tools 的 schema 和 prompt 指引，让 OpenCode 不依赖 MCP Tasks 也能启动多个 Sidekick agent 并轮询结果。
