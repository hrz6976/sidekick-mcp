# 交接记录 — 041438 · codex · implemented-model-discovery

## 继承的上下文

上一轮已由四个 subagent 调研模型发现语义，并形成结论：OpenCode/Codex 可以从本地 CLI/catalog 获取 model hints；Gemini/Claude 没有稳定 headless 模型列表，应该用内置候选/alias，避免称为 account availability。用户明确要求：Codex 和 OpenCode 从本地解析模型名称，Gemini 和 Claude 使用内置列表。

## 本次完成的工作

- [x] Codex `listModels` 改为调用 `codex debug models --bundled` 并解析本地 bundled catalog。
- [x] OpenCode 继续调用 `opencode models`，不加 `--refresh`。
- [x] Gemini 内置候选改为 `auto`, `pro`, `flash`, `flash-lite`, `gemini-2.5-pro`, `gemini-2.5-flash`。
- [x] Claude 内置候选保持 `sonnet`, `opus`, `haiku`。
- [x] setup/list_agents 文案和 JSON 字段改用 `modelHints`，避免 `availableModels`。
- [x] README starter config 的 Gemini 模型改为 `auto`。
- [x] 更新 runner/server tests，并完成验证。

## 当前状态

| 文件 | 变更描述 |
| --- | --- |
| `src/runners/registry.ts` | 新增 Codex bundled catalog JSON 解析；更新 built-in fallback hints。 |
| `src/tools/sidekick.ts` | setup/list_agents 使用 `modelHints` 文案和字段；更新 discovery 描述。 |
| `tests/runners.test.ts` | 增加 Codex bundled 解析/fallback 和 Gemini/Claude 内置列表测试。 |
| `tests/serverApp.test.ts` | 更新 list_agents 断言到 `modelHints`。 |
| `README.md` | 更新 Gemini 示例为 `auto`，说明 Codex/OpenCode/Gemini/Claude model hints 来源。 |
| `tasks/todo.md` | 记录 Model Discovery Implementation 和验证结果。 |

## 下一个 Agent 的待办事项

1. 如果用户继续要求更强语义，再把 `listModels(): Promise<string[]>` 升级为结构化 discovery result，携带 `source`、`confidence`、`validation`。
2. 如果要加 refresh/validate，必须显式 opt-in，默认不要触网或消耗额度。
3. 如果改 schema，更新 README、E2E、serverApp 和 initTools 测试。

## 关键决策记录

| 决策 | 原因 |
| --- | --- |
| Codex 用 `--bundled` | 本地、无远程刷新；符合“从本地解析模型名称”。 |
| Gemini starter 用 `auto` | Gemini CLI 有默认 routing；具体模型 ID 更容易过期或账号不可用。 |
| 字段名用 `modelHints` | 避免误导为账号 entitlement 或已验证可用模型。 |

## 阻塞项

- 无。

## 建议下一步

一句话：若继续增强，先设计结构化 model discovery schema，再实现 opt-in validation。
