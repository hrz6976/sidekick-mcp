# 交接记录 — 041332 · codex · complete-progress

## 继承的上下文

继承 `conversations/2026-06-03-agent-task-mcp/121032-codex-mcp-tasks-optional-fallback.md`：`ask_<agent>` 当前必须兼容普通 `tools/call` 和 task-augmented call，不能重新改回 task-only。普通 call 也会创建 Sidekick task metadata/logs。

本次用户要求调研每个 agent 的进度透传方式，并使用多个 subagent，把调研结果写入新的 handoff 文件夹后继续实现。

## 本次完成的工作

- [x] 创建 subagent 调研目录：`conversations/2026-06-03-agent-task-mcp/progress-research/`。
- [x] 启动三个 subagent 分别调研：
  - Claude/Gemini stream-json progress。
  - Codex/OpenCode JSONL progress。
  - MCP progress notifications / Tasks progress best practices。
- [x] 新增 `src/runners/progress.ts`：
  - 按 runner 解析 JSONL stdout。
  - 支持 partial line buffer。
  - 非 JSON stdout 走短文本 fallback。
  - Claude/Gemini/Codex/OpenCode 都产出人类可读 progress 摘要。
- [x] 在 `src/tools/sidekick.ts` 接入 renderer：
  - raw stdout 继续写 task log/result。
  - MCP progress 只发送 renderer 摘要。
- [x] 修复 `src/serverApp.ts` progress 终态：
  - 不再固定发送 `progress=100,total=100`。
  - 未知总量场景下终态继续递增，避免长任务 progress 倒退。
- [x] 新增 `tests/progressRenderer.test.ts`。
- [x] 扩展 `tests/serverApp.test.ts`，覆盖长 direct ask call 的 progress 单调递增。
- [x] 扩展 `tests/e2e-sidekick.mjs`，通过 built MCP server 验证 direct ask 的 progress token 收到 Gemini JSONL 渲染结果。
- [x] 更新 README、`tests/TESTS.md`、`tasks/todo.md`。

## 当前状态

| 文件 | 变更描述 |
| ---- | -------- |
| `src/runners/progress.ts` | 新增 provider-specific JSONL progress renderer |
| `src/tools/sidekick.ts` | raw stdout 落盘，renderer 摘要上报 MCP progress |
| `src/serverApp.ts` | terminal progress 改为未知总量单调递增模型 |
| `tests/progressRenderer.test.ts` | 覆盖四个 runner 的 event 映射和 partial/fallback |
| `tests/serverApp.test.ts` | 覆盖 direct ask progress 单调递增 |
| `tests/e2e-sidekick.mjs` | built-server E2E 覆盖 Gemini progress rendering |
| `README.md` | 说明 progress rendering 与 raw logs 保留 |
| `tests/TESTS.md` | 增加 progress renderer 覆盖说明 |
| `tasks/todo.md` | 记录本轮计划与验证结果 |

## 验证结果

- `npm test -- tests/progressRenderer.test.ts tests/serverApp.test.ts`
- `npm run lint`
- `npm test`：13 files / 105 tests
- `npm run test:e2e`：`SIDEKICK_E2E_OK`
- `npm run build`
- `git diff --check`

## 下一个 Agent 的待办事项

1. 如果用户希望更强的真实模型验证，可在有效模型配置下运行 `npm run test:e2e:real:all`，但会消耗本机 CLI/API 额度。
2. 如果未来要让 task-aware polling client 也看到进度，可继续实现 MCP task `statusMessage` 更新；本轮只保证 `notifications/progress`。
3. 如果要降低 OpenCode/Codex reasoning 暴露风险，可进一步把 reasoning progress 永久固定成状态消息，不显示摘要；当前实现已经对 OpenCode reasoning 降噪。

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| renderer 放在 `src/runners/progress.ts` | runner-specific schema 不应写死进 command executor；tool 层能同时保留 raw stdout 和发送摘要 |
| raw stdout 仍写 task logs/results | 保留可调试性，不破坏现有最终结果契约 |
| 普通 call 和 task call 共用 renderer | Claude Code 当前仍走普通 `tools/call`；两条路径都需要进度 |
| terminal progress 不用 `100/100` | agent CLI 无可靠总量；固定 100 会在长任务中违反 MCP 单调递增要求 |
| OpenCode reasoning 不直接透出完整文本 | 避免把 thinking blocks 当作高频 progress 暴露 |

## 阻塞项

- 无。

## 建议下一步

一句话：如需继续完善，优先给 task store 增加节流后的 `statusMessage` 更新，让不展示 `notifications/progress` 的 task client 也能通过 polling 看到进度。
