# 交接记录 — 041432 · codex · researched-model-discovery

## 继承的上下文

本线程已经完成 Sidekick MCP 的大规模重构、进度透传、普通 `tools/call` fallback、always-on `setup`，并发现当前 setup/list_agents 对模型列表语义过于粗糙：`models` / `availableModels` 容易把 fallback/candidate 误读成“账号当前可用模型”。用户要求多开 subagent 调研 codex、gemini、claude、opencode 如何更合适地获取模型列表。

## 本次完成的工作

- [x] 启动四个 subagent 分别调研 Codex/OpenAI、Gemini、Claude/Anthropic、OpenCode/通用 schema。
- [x] 收集四份研究报告。
- [x] 综合判断每个 runner 的 discovery 能力和语义边界。
- [x] 更新 `tasks/todo.md` 的 Model Discovery Research 小节。
- [x] 关闭所有 subagent。

## 当前状态

| 文件 | 变更描述 |
| --- | --- |
| `tasks/todo.md` | 新增/更新 Model Discovery Research 任务记录与综合 review。 |
| `conversations/2026-06-03-agent-task-mcp/model-discovery-research/codex-model-discovery.md` | Codex 模型 catalog 调研报告。 |
| `conversations/2026-06-03-agent-task-mcp/model-discovery-research/gemini-model-discovery.md` | Gemini CLI 模型发现调研报告。 |
| `conversations/2026-06-03-agent-task-mcp/model-discovery-research/claude-model-discovery.md` | Claude Code / Anthropic 模型发现调研报告。 |
| `conversations/2026-06-03-agent-task-mcp/model-discovery-research/opencode-general-model-discovery.md` | OpenCode 与通用 Sidekick schema 调研报告。 |

## 下一个 Agent 的待办事项

1. 若用户要求实现，优先修改 `src/runners/types.ts` / `src/runners/registry.ts`，把 `listModels(): Promise<string[]>` 升级为结构化 discovery result，包含 `source`、`confidence`、`validation`、`warnings`。
2. 修改 `src/tools/sidekick.ts` 的 `setup` 和 `list_agents` schema：避免字段名 `availableModels`；改用 `configuredModels`、`discoveredModels`、`modelHints`、`selectedModel`。
3. 给 `setup` / `list_agents` 增加 opt-in 参数：`refresh?: boolean`、`validate?: boolean`、`includeMetadata?: boolean`，默认全 false。
4. 更新 README、tests/serverApp.test.ts、tests/tools/initTools.test.ts、tests/e2e-sidekick.mjs 中对 setup/list_agents 输出的断言和文案。

## 关键决策记录

| 决策 | 原因 |
| --- | --- |
| 不再把 fallback/candidate 命名为 available models | Claude/Gemini 没有 headless/json 当前可用模型列表；fallback 只是提示。 |
| Codex 默认只适合 bundled/debug catalog hint | `codex debug models` 是 experimental，默认可能读 cache 或刷新 `/models`，不证明 entitlement。 |
| OpenCode 可作为 provider-layer discovery | `opencode models` 是实际 CLI 命令，但仍不是 live validation。 |
| validate 必须显式 opt-in | 最小真实调用可能触网、消耗额度、触发 rate/session limits。 |
| Gemini 默认推荐省略 `model` 或用 `auto` | Gemini CLI 有自己的 routing/default；硬填 preview/过期模型容易失败。 |

## 阻塞项

- 无。当前只是研究与设计建议；尚未修改源代码实现结构化 discovery。

## 建议下一步

一句话：如果继续实现，先把 runner model discovery 返回值从 `string[]` 改成结构化对象，再调整 setup/list_agents 文案与测试。
