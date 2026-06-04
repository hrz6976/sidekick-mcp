# 交接记录 — 041429 · codex · researched-claude-models

## 继承的上下文

继承 `conversations/2026-06-03-agent-task-mcp/041407-codex-updated-setup.md` 以及 `tasks/lessons.md` 中的相关 lesson：不要把静态 fallback 模型列表标成“当前可用模型”，需要区分 live CLI catalog、bundled catalog、configured allowlist、selected/default model 和 unverifiable candidate models。

用户本次要求：调研 Claude Code / Anthropic 如何获取模型列表，重点回答 CLI 是否有公开 headless/json 模型列表命令、源码中 `/model` / `availableModels` / `validateModel` / `modelCapabilities` 的语义、这些是否能作为账号当前可用模型列表、是否能/应该通过 API `models.list` 或最小真实调用验证，以及 Sidekick `setup` 的最佳语义。要求不要修改源码，把结论写入 `conversations/2026-06-03-agent-task-mcp/model-discovery-research/claude-model-discovery.md`。

## 本次完成的工作

- [x] 检查本机 `claude --version`、`claude --help`、`claude --print --help`。
- [x] 试探 `claude models --help`、`claude model --help`、`claude list-models --help`、`claude --models`。
- [x] 搜索并阅读 `/fast/hrz/tmp-sources/yasasbanukaofficial-claude-code` 中的模型相关源码。
- [x] 查阅官方 Anthropic Models API 文档。
- [x] 检查本环境 `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` 是否存在。
- [x] 写入调研结论文件。
- [x] 更新 `tasks/todo.md` 的本轮计划和 review/results。

## 当前状态

未修改源码。

| 文件 | 变更描述 |
| ---- | -------- |
| `conversations/2026-06-03-agent-task-mcp/model-discovery-research/claude-model-discovery.md` | 新增 Claude 模型发现调研结论 |
| `tasks/todo.md` | 追加本轮 Claude Model Discovery Research 计划和结果 |
| `conversations/2026-06-03-agent-task-mcp/041429-codex-researched-claude-models.md` | 新增本交接记录 |

验证：

- `git diff --check -- tasks/todo.md conversations/2026-06-03-agent-task-mcp/model-discovery-research/claude-model-discovery.md` 通过。

## 下一个 Agent 的待办事项

1. 若用户要求落地代码变更，优先把 Claude/Gemini/Codex fallback `models` 字段改名或补充 `modelDiscoveryKind`，避免 `availableModels` 误导。
2. 若用户要求验证某个 Claude model，先确认是否允许消耗额度，再选择 API `GET /v1/models` / minimal Messages call / `claude --print --model <model>`。
3. 若继续增强 setup，保持默认 setup 低副作用：不自动执行真实模型调用。

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| 不运行真实模型调用 | 本环境没有 `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN`，且 setup 默认不应消耗额度 |
| 不把 `sonnet` / `opus` / `haiku` 叫作 live available models | Claude CLI 没有公开 headless/json catalog；这些只是 alias/candidate hints |
| API `models.list` 只作为 API workspace 语义 | 它不等同于 Claude Code CLI OAuth/订阅登录态 |

## 阻塞项

- 无。

## 建议下一步

一句话：如果继续实现，先调整 Sidekick setup/list_agents 的字段名和文案，把 fallback hints 与 verified/live discovery 明确分开。

