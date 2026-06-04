# 交接记录 — 041333 · codex · complete-progress

## 继承的上下文

继承 `conversations/2026-06-03-agent-task-mcp/121032-codex-mcp-tasks-optional-fallback.md`：

- `ask_<agent>` 已改成 `taskSupport: "optional"`，必须兼容普通 `tools/call` 和 task-augmented call。
- Claude Code 2.1.162 的真实调用路径会传 progress token，但不会发送 task augmentation。
- Sidekick 已能把 stdout chunk 通过 MCP progress reporter 上报，但此前只是原始 JSONL 预览。

本次用户要求：调研四个 agent 的进度透传方式，使用 subagents / 互联网 / 已克隆源码，调研结果写入新的 handoff 文件夹，并实现。

## 本次完成的工作

- [x] 创建调研文件夹 `conversations/2026-06-03-agent-task-mcp/progress-research/`。
- [x] 启动 3 个 subagents：Claude/Gemini、Codex/OpenCode、MCP progress best practices。
- [x] Claude/Gemini subagent 写入 `progress-research/claude-gemini-progress.md`。
- [x] 由于环境中途切换导致另外两个 subagent 句柄丢失，主 agent 补做 Codex/OpenCode 和 MCP progress 调研并写入：
  - `progress-research/codex-opencode-progress.md`
  - `progress-research/mcp-progress-best-practices.md`
- [x] 按用户要求克隆并分析 `yasasbanukaofficial/claude-code`：
  - 位置：`/tmp/sidekick-progress-research/yasasbanukaofficial-claude-code`
  - 重点文件：`src/entrypoints/sdk/coreSchemas.ts`、`src/cli/print.ts`、`src/remote/sdkMessageAdapter.ts`
- [x] 新增 `src/runners/progress.ts`：runner-aware JSONL progress renderer。
- [x] 更新 `src/tools/sidekick.ts`：raw stdout 仍写 task metadata/result；MCP progress 改为 renderer 生成的人类可读摘要。
- [x] 新增 `tests/progressRenderer.test.ts` 覆盖 Claude、Gemini、Codex、OpenCode、partial line 和 non-JSON fallback。
- [x] 更新 `tests/serverApp.test.ts`，增加 server-level 回归：Claude JSONL stdout 会变成 `Claude using Bash` progress，而不是 raw JSON。
- [x] 更新 `tasks/todo.md` 记录本轮计划、调研、实现和验证结果。

## 当前状态

| 文件 | 变更描述 |
| ---- | -------- |
| `src/runners/progress.ts` | 新增 provider-specific JSONL progress renderer |
| `src/tools/sidekick.ts` | 集成 renderer，raw stdout 落盘，readable progress 上报 |
| `tests/progressRenderer.test.ts` | 新增四 runner progress renderer 单测 |
| `tests/serverApp.test.ts` | 新增 MCP progress 翻译集成回归 |
| `conversations/2026-06-03-agent-task-mcp/progress-research/*.md` | 新增调研输出 |
| `tasks/todo.md` | 新增 Provider Progress Rendering 计划和结果 |

## 验证结果

已通过：

- `npm test -- tests/progressRenderer.test.ts tests/serverApp.test.ts`
- `npm run lint`
- `npm test`：13 files / 106 tests
- `npm run test:e2e`：`SIDEKICK_E2E_OK`
- `npm run build`

## 下一个 Agent 的待办事项

1. 可选：真实 CLI smoke 时观察 Claude/Gemini/Codex/OpenCode 在真实客户端里的 progress UI 展示；当前测试已覆盖 renderer 和 fake E2E。
2. 可选：考虑 stderr progress renderer，但要先决定是否把 CLI warnings 暴露给用户；当前 stderr 仍只进日志。
3. 如果继续改 Claude renderer，可参考克隆仓库中的 `coreSchemas.ts` 新事件，例如 `task_started` / `task_progress` / `task_notification`。

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| renderer 放在 `src/runners/progress.ts` | 这是 runner/CLI 输出语义，不应塞进 MCP server reporter |
| raw stdout 继续写 metadata/result | progress 摘要不应改变调试日志和最终结果 |
| 未知 JSON event 静默忽略 | 避免把未来 schema 的大 JSON 直接污染 progress UI |
| 非 JSON 行保留 fallback | Gemini/CLI 可能在 stdout 混入 warning 或纯文本输出 |
| 不改 runner command 参数 | 当前 `stream-json` / `--json` / `--format json` 已被测试锁定，renderer 不需要改变 CLI 调用契约 |

## 阻塞项

- 两个 subagent 句柄因环境切换返回 `not_found`；主 agent 已用本地 `gh`/源码调研补齐对应 handoff 文件。
- 当前 sandbox 的 namespace helper 会失败，后续命令可能需要 `require_escalated`。

## 建议下一步

一句话：如果要继续提高真实体验，优先跑一次真实 Claude 调用并观察客户端是否稳定显示 `Claude using ...` / `Gemini: ...` 这类摘要。
