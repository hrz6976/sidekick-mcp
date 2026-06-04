# 交接记录 — 041444 · codex · implemented-reasoning-effort

## 继承的上下文

Sidekick 已经支持 config-generated `ask_<agent>` tools、model hints、progress rendering、普通 `tools/call` fallback。用户要求把 reasoning-effort 作为 ask 配置支持，并确认 Claude/Codex 支持，Gemini/OpenCode 需要查证。

## 本次完成的工作

- [x] 查本机 CLI：Claude 有 `--effort`；Codex 通过 `--config model_reasoning_effort=...`；OpenCode 有 `--variant`；Gemini 没有 direct headless reasoning-effort flag。
- [x] `AgentConfig` 新增 `reasoningEffort?: string`。
- [x] runner 参数映射：
  - Claude -> `--effort <value>`
  - Codex -> `--config model_reasoning_effort="<value>"`
  - OpenCode -> `--variant <value>`
  - Gemini -> 不自动注入。
- [x] 避免和 `extraArgs` 中已有同类 flag 重复。
- [x] setup/list_agents 输出 `reasoningEffort`。
- [x] README 和测试更新。

## 当前状态

| 文件 | 变更描述 |
| --- | --- |
| `src/config.ts` | 解析 `reasoningEffort`。 |
| `src/runners/registry.ts` | 新增 reasoning effort 映射和去重逻辑。 |
| `src/tools/sidekick.ts` | setup/list_agents 显示 reasoningEffort，推荐配置 DeepSeek 使用一等字段。 |
| `README.md` | 文档说明 reasoningEffort 映射和 Gemini 限制。 |
| `tests/runners.test.ts` | 覆盖四个 runner 的映射/不映射和去重。 |
| `tests/config.test.ts` | 覆盖 config 解析。 |
| `tests/serverApp.test.ts` | 覆盖 list_agents 返回 reasoningEffort。 |
| `tests/tools/initTools.test.ts` | 更新 fixture。 |
| `tasks/todo.md` | 记录实现和验证结果。 |

## 下一个 Agent 的待办事项

1. 如果用户想让 Gemini 也有一等 thinking config，需要设计独立字段，例如 `thinkingBudget` 或 `thinkingLevel`，并确认 Gemini CLI 是否能通过 config/settings 或命令行覆盖。
2. 如果后续支持 real validation，可以用真实 CLI smoke 确认每个 runner 的 reasoningEffort 是否被 provider 接受。

## 关键决策记录

| 决策 | 原因 |
| --- | --- |
| OpenCode 使用 `--variant` | 本机 `opencode run --help` 明确说明 variant 是 provider-specific reasoning effort。 |
| Codex 使用 `--config model_reasoning_effort=...` | Codex exec 无专用 flag；官方 Codex SDK/文档使用 config override。 |
| Gemini 不自动注入 | 本机 `gemini --help` 无 reasoning effort flag；乱加会导致无效参数。 |

## 阻塞项

- 无。

## 建议下一步

一句话：如果要进一步完善 Gemini，单独调研并实现 thinkingBudget/thinkingLevel，而不是复用 reasoningEffort。
