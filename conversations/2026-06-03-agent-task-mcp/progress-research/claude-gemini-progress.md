# Claude Code / Gemini CLI stream-json progress 调研

日期：2026-06-04

## 1. 查看过的命令 / 资料

本地仓库：

- `src/runners/registry.ts`：Sidekick 目前对 Claude 使用 `--print --output-format stream-json --verbose`；对 Gemini 使用 `--prompt ... --output-format stream-json --approval-mode ...`。
- `src/serverApp.ts`：当前 progress reporter 只从 stdout chunk 做 `extractProgressPreview(chunk)`，还没有按 JSONL event 解析。
- `tests/runners.test.ts`：已有测试锁定 Claude/Gemini runner 会构造 `stream-json` 参数。

本地 CLI：

- `claude --version`：`2.1.162 (Claude Code)`。
- `claude --help`：确认 `--output-format text|json|stream-json`、`--input-format text|stream-json`、`--verbose`、`--include-partial-messages`、`--include-hook-events`、`--permission-mode`。
- `gemini --version`：`0.45.0`。
- `gemini --help`：确认 `-o, --output-format` 支持 `text|json|stream-json`，并有 `--raw-output`。
- `claude --print --output-format stream-json --verbose --max-turns 1 --permission-mode plan --model sonnet -- '只输出 OK'`：采样无工具调用输出。
- `claude --print --output-format stream-json --verbose --max-turns 2 --permission-mode bypassPermissions --tools Bash --model sonnet -- '运行 pwd，然后用一句话说明当前目录。'`：采样工具调用输出。
- `gemini --skip-trust --prompt '只输出 OK' --output-format stream-json --approval-mode default`：采样 Gemini JSONL 输出。

本地安装包 / 文档：

- `/home/hrz/.npm/lib/node_modules/@google/gemini-cli/README.md`：说明 `--output-format stream-json` 会输出 newline-delimited JSON events。
- `/home/hrz/.npm/lib/node_modules/@google/gemini-cli/bundle/docs/cli/headless.md`：列出 Gemini stream event 类型。
- `/home/hrz/.npm/lib/node_modules/@google/gemini-cli/bundle/gemini-JMMBFICD.js`：查看实际 emit 字段：`init`、`message`、`tool_use`、`tool_result`、`error`、`result`。

官方资料：

- Claude Code CLI reference: https://code.claude.com/docs/en/cli-usage
- Claude Agent SDK streaming output: https://code.claude.com/docs/en/agent-sdk/streaming-output
- Claude Agent SDK todo/task tracking: https://code.claude.com/docs/en/agent-sdk/todo-tracking
- Gemini CLI headless mode: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md
- Gemini CLI reference: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md
- Gemini CLI configuration reference: https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md

## 2. Claude 输出 event 示例或字段

### 基本流

Claude Code `stream-json` 是 JSONL，每行一个 JSON 对象。实际样本中的主要顺序：

```json
{"type":"system","subtype":"init","cwd":"/fast/hrz/multicli","session_id":"...","tools":["Task","Bash","Read"],"mcp_servers":[{"name":"sidekick","status":"pending"}],"model":"claude-sonnet-4-6","permissionMode":"plan","claude_code_version":"2.1.162","uuid":"..."}
{"type":"assistant","message":{"model":"claude-sonnet-4-6","role":"assistant","content":[{"type":"text","text":"OK"}],"usage":{"input_tokens":3,"output_tokens":1}},"session_id":"...","uuid":"...","request_id":"..."}
{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","resetsAt":1780557600,"rateLimitType":"five_hour"},"uuid":"...","session_id":"..."}
{"type":"result","subtype":"success","is_error":false,"duration_ms":2101,"duration_api_ms":1991,"ttft_ms":1948,"num_turns":1,"result":"OK","stop_reason":"end_turn","session_id":"...","total_cost_usd":0.0435936,"usage":{"input_tokens":3,"output_tokens":4},"modelUsage":{"claude-sonnet-4-6":{"inputTokens":3,"outputTokens":4,"costUSD":0.0435936}}}
```

注意：我没有显式传 `--include-hook-events`，但本机样本仍在 `init` 前出现了：

```json
{"type":"system","subtype":"hook_started","hook_name":"SessionStart:startup","hook_event":"SessionStart","session_id":"..."}
{"type":"system","subtype":"hook_response","hook_name":"SessionStart:startup","outcome":"success","stdout":"","stderr":"","exit_code":0,"session_id":"..."}
```

另一个样本中还出现了思考 token 估算：

```json
{"type":"system","subtype":"thinking_tokens","estimated_tokens":74,"estimated_tokens_delta":52,"session_id":"..."}
```

### 工具调用

Claude 工具调用不是顶层 `tool_use` event，而是包在 `type:"assistant"` 的 `message.content[]` 里；工具结果是顶层 `type:"user"`，内容里是 `tool_result`。

```json
{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_...","name":"Bash","input":{"command":"pwd","description":"Print working directory"},"caller":{"type":"direct"}}]},"session_id":"..."}
{"type":"user","message":{"role":"user","content":[{"tool_use_id":"toolu_...","type":"tool_result","content":"/fast/hrz/multicli","is_error":false}]},"session_id":"...","tool_use_result":{"stdout":"/fast/hrz/multicli","stderr":"","interrupted":false,"isImage":false,"noOutputExpected":false}}
```

### partial streaming

Claude 官方 Agent SDK 文档说明，只有启用 partial messages 时才会得到 raw API stream event。CLI 对应参数是：

- `--include-partial-messages`
- 仍需 `--print --output-format stream-json --verbose`

这类 event 形状是：

```json
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}},"session_id":"...","uuid":"..."}
{"type":"stream_event","event":{"type":"content_block_start","content_block":{"type":"tool_use","name":"Read"}},"session_id":"..."}
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"..."}},"session_id":"..."}
```

Sidekick 当前 runner 没有传 `--include-partial-messages`，所以默认应按完整 `assistant/user/result/system` 消息渲染，不依赖 token 级 delta。

## 3. Gemini 输出 event 示例或字段

Gemini CLI `stream-json` 也是 JSONL，但本机样本显示 stdout 前面可能混有非 JSON warning 行：

```text
Warning: Basic terminal detected (TERM=dumb). Visual rendering will be limited...
Warning: 256-color support not detected...
Skill "skill-creator" from "/home/hrz/.agents/skills/skill-creator/SKILL.md" is overriding the built-in skill.
```

随后才是 JSONL：

```json
{"type":"init","timestamp":"2026-06-04T05:22:04.038Z","session_id":"38359eb7-c8e9-48e9-b419-49ce72440d9d","model":"auto"}
{"type":"message","timestamp":"2026-06-04T05:22:04.043Z","role":"user","content":"只输出 OK"}
{"type":"tool_use","timestamp":"2026-06-04T05:22:20.902Z","tool_name":"update_topic","tool_id":"update_topic__update_topic_1780550540836_0","parameters":{"title":"Session Initialized","summary":"...","strategic_intent":"..."}}
{"type":"tool_result","timestamp":"2026-06-04T05:22:20.917Z","tool_id":"update_topic__update_topic_1780550540836_0","status":"success","output":"## Topic: **Session Initialized**..."}
{"type":"message","timestamp":"2026-06-04T05:22:23.226Z","role":"assistant","content":"OK","delta":true}
{"type":"result","timestamp":"2026-06-04T05:22:23.237Z","status":"success","stats":{"total_tokens":35682,"input_tokens":33651,"output_tokens":151,"cached":11879,"input":21772,"duration_ms":19200,"tool_calls":1,"models":{"gemini-3.1-flash-lite":{"total_tokens":4118,"input_tokens":3310,"output_tokens":40},"gemini-3-flash-preview":{"total_tokens":31564,"input_tokens":30341,"output_tokens":111}}}}
```

从本地打包源码确认的字段：

- `init`: `type`, `timestamp`, `session_id`, `model`
- `message` user: `type`, `timestamp`, `role:"user"`, `content`
- `message` assistant delta: `type`, `timestamp`, `role:"assistant"`, `content`, `delta:true`
- `tool_use`: `type`, `timestamp`, `tool_name`, `tool_id`, `parameters`
- `tool_result`: `type`, `timestamp`, `tool_id`, `status:"success"|"error"`, `output?`, `error?`
- `error`: `type`, `timestamp`, `severity:"warning"|"error"`, `message`
- `result`: `type`, `timestamp`, `status:"success"|"error"`, `stats?`, `error?`

官方 headless 文档列出的 event 类型与源码一致：`init`、`message`、`tool_use`、`tool_result`、`error`、`result`。

## 4. Renderer 建议

### 总体策略

实现一个 runner-aware JSONL progress renderer，不要只把 stdout chunk 截断展示。建议流程：

1. 按行缓冲 stdout chunk，保留未完成行。
2. 对每个完整行先 `JSON.parse`。
3. 解析成功则按 runner 分发到 `renderClaudeEvent` / `renderGeminiEvent`。
4. 解析失败则走 fallback 文本清洗：去 ANSI、trim、跳过空行；短 warning 可以上报，长文本截断。
5. 对重复/高频 message 做节流和去重，仍复用现有 `progressThrottleMs`。

### Claude 应上报

- `system/init`：上报一次，例如 `Claude started: claude-sonnet-4-6 in /fast/hrz/multicli`。可附带 `permissionMode`，不要输出完整 `tools` / `mcp_servers`。
- `assistant.message.content[].type === "text"`：上报最新文本片段/摘要。默认完整 assistant message 到达才有，适合作为 progress preview。
- `assistant.message.content[].type === "tool_use"`：上报工具开始，例如 `Claude using Bash: pwd`、`Claude using Read: README.md`。只展示安全摘要，不展示完整大 JSON。
- `user.message.content[].type === "tool_result"` 或顶层 `tool_use_result`：上报工具完成，例如 `Bash completed`；若 `is_error` 或 `stderr` 非空，上报 `Bash failed: <short stderr>`。
- `system/thinking_tokens`：可低优先级上报，例如 `Claude thinking...`，但应强去重，只在长时间没有其他事件时使用。
- `result`：上报完成/失败。`subtype:"success"` 且 `is_error:false` -> completed；错误 subtype 或 `is_error:true` -> failed，并展示 `api_error_status` / `terminal_reason` / 简短 result。
- `rate_limit_event`：只在非 allowed、接近限制、或 overage 相关状态异常时上报；正常 `status:"allowed"` 忽略。

### Claude 应忽略或降噪

- `system/hook_started`、`system/hook_response` 成功且无 stderr：忽略。失败时才上报 `Hook failed: <hook_name>`。
- `system/init` 里的 `tools`、`slash_commands`、`skills`、`plugins`、`memory_paths`：不要直接渲染，太长且泄漏本机上下文。
- `assistant.message.content[].type === "thinking"`：默认不要展示具体 thinking 内容；如果需要 progress，只展示 `Claude thinking...`。
- `usage`、`modelUsage`、`total_cost_usd`：最终结果或 debug 日志中保留，不适合作为普通 progress。

### Gemini 应上报

- `init`：上报一次，例如 `Gemini started: model auto`。
- `message role:"assistant"`：如果 `delta:true`，累积最近文本并节流展示，例如 `Gemini: OK`；不要每个 token/chunk 都发 MCP progress。
- `tool_use`：上报工具开始，例如 `Gemini using update_topic: Session Initialized`。不同工具取不同摘要：
  - `parameters.command` 优先显示命令；
  - `parameters.path` / `file_path` 显示路径；
  - `parameters.title` 显示标题；
  - 否则显示 `tool_name`。
- `tool_result`：上报工具完成/失败；`status:"error"` 展示 `error.message`，`success` 默认只展示 `Tool completed`，不要直接输出完整 `output`。
- `error`：`severity:"warning"` 上报为 warning progress，`severity:"error"` 上报为 failed-ish progress，但最终状态仍以进程 exit / `result.status` 为准。
- `result`：`status:"success"` 上报 completed；`status:"error"` 展示 `error.message` / `error.code`。`stats.duration_ms` 和 `stats.tool_calls` 可用于最终摘要。

### Gemini 应忽略或降噪

- `message role:"user"`：这是 Sidekick 自己传入的 prompt，通常不需要回显。
- `tool_result.output`：可能很长，且可能包含 markdown/文件内容；默认不直接上报，只用于生成短摘要。
- `stats.models` 的完整 breakdown：普通 progress 忽略，debug 日志保留。
- stdout 中非 JSON 的 terminal warning：可以作为 fallback 上报一次，但建议归类为 `CLI warning`，不要阻断 JSONL 解析。

### fallback

- 任何 runner 都必须支持混合 stdout：JSONL + 非 JSON 行 + chunk 边界断行。
- 如果连续解析不到 JSON：
  - 对 Claude：可能是错误输出或用户改了 `extraArgs` 导致 text/json 格式，使用现有 `extractProgressPreview` 行为。
  - 对 Gemini：先过滤常见 warning；其余非 JSON 行按短文本 progress。
- 如果 JSON event 类型未知：
  - 有 `message` 字段则显示短 message；
  - 有 `content` 字段且是 string 则显示短 content；
  - 否则 debug log 记录 `unknown_stream_event`，progress 不展示。
- 对所有文本做长度限制，例如单条 progress 160-240 字符；路径/命令保留头尾；去 ANSI。

## 5. 风险 / 未知

- Claude Code event schema 在 2.1.x 已比旧 SDK 文档更多：本地出现 `rate_limit_event`、`thinking_tokens`、hook events、`terminal_reason`、`fast_mode_state` 等字段。renderer 应宽松解析，不要用封闭 union。
- Claude 工具调用默认不是顶层 `tool_use`，而是在 `assistant.message.content[]`；如果未来启用 `--include-partial-messages`，还会出现 `stream_event` raw API events，需要单独处理。
- Claude 本机样本在未显式传 `--include-hook-events` 时仍输出 hook events，可能受本地配置/插件影响；不能假设 hook event 只在该 flag 下出现。
- Gemini `stream-json` 的 stdout 可能混入非 JSON warning 行；严格 JSONL parser 如果遇到第一行 warning 就失败，会导致完全没有 progress。
- Gemini 本机样本因为项目/用户配置自动调用了 `update_topic` 工具，即使 prompt 是“只输出 OK”。renderer 不应假设简单 prompt 没有工具事件。
- Gemini 官方配置文档中 `output.format` 只列 `text/json`，但 CLI flag 和 headless 文档列 `stream-json`；应以 CLI flag/help 和 headless 文档为准。
- 两个 CLI 的 event 都可能包含敏感路径、命令、工具参数、stderr、成本/usage；progress 面向用户时应摘要化，完整 stdout 仍写日志文件。
- 真实长任务中的工具名和参数 shape 会随 CLI、MCP、插件变化。renderer 的工具摘要函数应做 best-effort，而不是依赖固定字段。
