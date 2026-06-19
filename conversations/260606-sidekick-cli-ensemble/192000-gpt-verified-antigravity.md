# 交接记录 — 192000 · gpt · verified-antigravity

## 继承的上下文

承接 `191605-gpt-complete-antigravity.md`。上一轮已实现 `runner: "antigravity"`，但因为本机当时未安装/登录 `agy`，只做了官方 `--help` 与 fake E2E 验证。用户随后完成登录并要求重新测试 `agy`。

## 本次完成的工作

- [x] 确认 `agy` 在 PATH：`/Users/hrz/.local/bin/agy`。
- [x] 确认 `agy --version` 为 `1.0.10`。
- [x] 运行 `agy models`，确认真实输出是带空格的 display names。
- [x] 修复 Antigravity model parser，保留完整模型名，如 `Gemini 3.5 Flash (Medium)`，不再截断为首词。
- [x] 更新 `tests/real-sidekick-command-smoke.mjs` 和 `tests/real-mcp-smoke.mjs`，让 `agent=antigravity` 默认 command 为 `agy`。
- [x] 跑通 real standalone Sidekick smoke 和 real MCP smoke。

## 当前状态

| 文件 | 变更描述 |
| ---- | -------- |
| `src/runners/antigravity.ts` | `agy models` parser 现在保留完整 display name，并过滤 heading/重复项。 |
| `tests/runners.test.ts` | Antigravity model discovery fixture 改成真实输出形态。 |
| `tests/real-sidekick-command-smoke.mjs` | `antigravity` agent 默认 command 改为 `agy`。 |
| `tests/real-mcp-smoke.mjs` | `antigravity` agent 默认 command 改为 `agy`。 |
| `tasks/todo.md` | 追加 real smoke 结果和 parser 修正说明。 |

验证已通过：

- `command -v agy && agy --version && agy models`
- `npm test -- tests/runners.test.ts`
- `npm run lint`
- `npm run build`
- `node tests/real-sidekick-command-smoke.mjs antigravity`（`SIDEKICK_REAL_COMMAND_SMOKE_OK agent=antigravity model=`）
- `node tests/real-mcp-smoke.mjs antigravity`（`SIDEKICK_REAL_MODEL_SMOKE_OK agent=antigravity model=`）
- `npm test`（16 files / 132 tests）
- `npm run test:sidekick:e2e`（`SIDEKICK_COMMAND_E2E_OK`）
- `npm run test:mcp:e2e`（`SIDEKICK_E2E_OK`）
- `npm run copy:ensemble-sidekick`
- `git diff --check`

## 下一个 Agent 的待办事项

1. 提交前检查 `git status --short`，当前包含 Antigravity runner、real smoke script 修正、任务记录和两份 handoff note。
2. 如需发布，commit message 必须包含 “Claude, Codex, and Gemini”。
3. 如果未来要把 Antigravity 加入 `test:*:real:all`，注意这会消耗 Google/Antigravity 配额，并要求本机 `agy` 已登录。

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| `agy models` 保留完整显示名 | 真实输出是 `Gemini 3.5 Flash (Medium)` 这类名称；截断首词会生成不可用 model 配置。 |
| real smoke 不传 model | 先验证默认模型路径，避免猜测 `--model` 是否接受 display name；model discovery 仍会把完整 display name 暴露给 setup/list。 |
| real smoke scripts 特判 `antigravity -> agy` | runner 名与 binary 名不同；脚本默认 command 不能再简单等于 agent。 |

## 阻塞项

- 无。真实 `agy` standalone 和 MCP smoke 均已通过。

## 建议下一步

下一步可以提交当前变更；若要做更强验证，可手动测试 `sidekick run --agent antigravity --model "<agy models 输出之一>"`。
