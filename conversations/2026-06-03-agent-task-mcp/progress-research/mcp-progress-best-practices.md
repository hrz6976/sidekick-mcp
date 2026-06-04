# MCP progress notifications / Tasks 调研

日期：2026-06-04

## 1. 资料来源

- MCP specification: progress notifications，`notifications/progress` 只在请求 `_meta.progressToken` 存在时发送。
- MCP Tasks extension overview：Tasks 是 experimental extension，长任务可返回 task handle，并通过 task result/poll/stream 获取结果。
- TypeScript SDK 行为：普通 `callTool` 可带 progress callback；`experimental.tasks.callToolStream` 会为 task-capable tool 注入 task augmentation。
- 本仓库：`src/serverApp.ts` 的 `createProgressReporter`、task branch、direct call branch。

## 2. MCP progress/token/节流/heartbeat 建议

- 只有收到 progress token 才发送 `notifications/progress`，否则应静默执行。
- `progress` 字段不必是真实百分比；可以是单调递增计数。完成时发送 `progress: 100, total: 100`。
- 长任务应有 heartbeat，避免客户端以为 MCP server 卡住。
- stdout 高频事件应节流，保留 latest preview 即可。
- 对 task-augmented 和 ordinary `tools/call` 应使用同一 progress reporter，避免两个路径体验不同。

## 3. 本仓库现状差距

现状已有：

- `createProgressReporter` 支持 start、onOutput、stop、节流、heartbeat。
- direct call 和 task call 都会创建 reporter。
- `executeCommand` 会把 stdout chunk 传给 `onProgress`。

差距：

- 原先直接把 stdout chunk preview 透传，JSONL 会显示成原始 JSON。
- stderr 只进日志，不作为 progress。
- provider-specific tool/text/reasoning event 没有语义化。

## 4. 具体实现建议

- 在 runner stdout chunk 到 MCP progress 之间增加 runner-aware JSONL renderer。
- 保留 raw stdout 写 metadata/result，不要为了漂亮 progress 改变最终日志。
- renderer 做状态机：按行缓冲、解析 JSON、未知 JSON event 静默忽略、非 JSON 行 fallback。
- 对 Claude/Gemini/Codex/OpenCode 分别映射常见 event。
- 继续复用 `progressThrottleMs` 和 `progressIdleHeartbeatMs`，renderer 不自己发 notification。
- final result 仍以 CLI exit code/result 为准，progress 只做用户可见状态。

## 5. 风险 / 未知

- MCP 客户端对 progress UI 的展示差异很大，不能假设所有客户端都会显示每条 message。
- Claude Code 当前 ordinary `tools/call` 有 progress token；OpenCode 之前也会用 progress reset timeout，但未必有 Tasks。
- 如果 CLI 混合 stderr 警告和 stdout JSONL，当前只处理 stdout；stderr 语义化可作为后续增强。
