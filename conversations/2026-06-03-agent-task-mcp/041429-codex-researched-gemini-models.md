# 交接记录 — 041429 · codex · researched-gemini-models

## 继承的上下文

继承 `conversations/2026-06-03-agent-task-mcp/041407-codex-updated-setup.md` 和 `tasks/lessons.md` 中关于模型发现的约束：不能把静态 fallback 模型列表标成“当前可用模型”；setup 应保持轻量，避免触发未知远程刷新或认证副作用。

本次用户要求调研 Google Gemini CLI 如何获取模型列表，并写入 `conversations/2026-06-03-agent-task-mcp/model-discovery-research/gemini-model-discovery.md`。用户明确要求不修改源代码。

## 本次完成的工作

- [x] 查看本机 `gemini --version` / `gemini --help` / `gemini models --help` / `gemini list --help`。
- [x] 克隆或更新 `google-gemini/gemini-cli` 到 `/fast/hrz/tmp-sources/google-gemini-cli`。
- [x] 阅读 Gemini CLI 官方 docs 与源码中模型选择、配置、routing、availability 相关实现。
- [x] 查 Google AI API `models.list` 官方文档。
- [x] 写出 Gemini 专项调研报告。
- [x] 更新 `tasks/todo.md` 的 Gemini Model Discovery Research 小节和结果。

## 当前状态

| 文件 | 变更描述 |
| ---- | -------- |
| `conversations/2026-06-03-agent-task-mcp/model-discovery-research/gemini-model-discovery.md` | 新增 Gemini CLI 模型发现调研报告 |
| `tasks/todo.md` | 标记 Gemini 调研计划完成并补 Review / Results |
| `conversations/2026-06-03-agent-task-mcp/041429-codex-researched-gemini-models.md` | 本交接记录 |

未修改 `src/`、`tests/` 或其他源代码。

## 关键结论

| 结论 | 原因 |
| ---- | ---- |
| Gemini CLI 没有 headless/json `list models` 命令 | 本机 help 与源码命令注册均未发现；`/model` 是交互式 slash command |
| `--model > GEMINI_MODEL > settings.model.name > local router > default auto` | 官方 model-routing docs 与 `packages/cli/src/config/config.ts` 一致 |
| `VALID_GEMINI_MODELS` / `getAvailableModelOptions()` / `ModelAvailabilityService` 不能当作账号可用模型列表 | 它们分别是静态集合、配置/候选过滤、当前会话失败健康状态 |
| Sidekick 默认不应调用 Google AI API `models.list` | 该 API 返回 Gemini API catalog，不等于 Gemini CLI 当前 OAuth/Code Assist/Vertex/local Gemma 可用性 |
| Sidekick setup 应返回 configured/default/candidates 并标注来源 | 避免把候选、fallback、配置值误称为 live availability |

## 下一个 Agent 的待办事项

1. 如继续实现模型发现语义，请先改字段命名和文案：`availableModels` 更适合改为 `candidateModels` / `modelHints`，并给每个来源打标签。
2. Gemini starter config 建议省略 `model` 或使用 `auto`，不要自动推荐 `gemini-3.1-pro` / `gemini-3-flash` 这类可能无效的裸 preview 字符串。
3. 若要 live discovery，设计成显式 opt-in 的 Gemini API catalog 查询，不能混入默认 setup。

## 阻塞项

- 无。

## 建议下一步

一句话：如果要落地本调研，先把 Sidekick setup/list_agents 的模型字段改成“候选/来源标注”语义，再考虑 opt-in API catalog。
