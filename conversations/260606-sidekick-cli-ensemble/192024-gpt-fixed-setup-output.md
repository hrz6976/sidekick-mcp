# 交接记录 — 192024 · gpt · fixed-setup-output

## 继承的上下文

承接 `191605-gpt-complete-antigravity.md` 和 `192000-gpt-verified-antigravity.md`。Antigravity runner 已实现并推送到 `main`（commit `51eafbb`）。用户指出 setup 输出中的 JSON 很冗余，同一个 model name 会出现多次，要求先跑 smoke 并说明发现。

## 本次完成的工作

- [x] 跑 missing-config `sidekick setup --json` smoke，确认推荐模型在 discovery 和 recommended config 中重复。
- [x] 跑 non-JSON/MCP setup prompt smoke，确认该路径最冗余：同时嵌入 discovery JSON 和完整 starter config JSON。
- [x] 跑 loaded-config setup JSON smoke，确认 `configuredAgents[*].model` 和 `configuredAgents[*].configuredModels` 自我重复。
- [x] 将 setup 推荐输出从完整 `recommendedConfig` 改为 `recommendedConfigTemplate`。
- [x] 推荐模板中的重复 model value 改为 `modelRef`，例如 `runnerDiscovery.antigravity.models[0]`。
- [x] `configuredModels` 现在只保留 config 中显式 `models` allowlist，不再复制主 `model` 字段。
- [x] 缩短 Claude/Gemini `modelDiscoveryDescription`，避免 alias 在 `models` 和描述中重复出现。
- [x] 更新测试并完成验证。

## 当前状态

| 文件 | 变更描述 |
| ---- | -------- |
| `src/core/setup.ts` | setup state 改用 `recommendedConfigTemplate`；模板中重复模型值变为 `modelRef`；configured summary 不再把 `model` 复制进 `configuredModels`。 |
| `src/core/agents.ts` | `list_agents` 中 `configuredModels` 同步改为只展示显式 `models` allowlist。 |
| `src/runners/claude.ts` / `src/runners/gemini.ts` | model discovery 描述去掉已经在 `models` 数组里出现的 alias 列表。 |
| `tests/serverApp.test.ts` | setup recommendation assertions 改为检查 `modelRef`。 |
| `tasks/todo.md` | 记录 smoke 发现、修复和验证结果。 |
| `~/.agents/skills/ensemble/bin/sidekick.mjs` | 已通过 `npm run copy:ensemble-sidekick` 复制最新 bundle。 |

验证已通过：

- setup smoke with missing config, non-JSON prompt, and loaded config
- `npm run lint`
- `npm test`（16 files / 132 tests）
- `npm run test:sidekick:e2e`（`SIDEKICK_COMMAND_E2E_OK`）
- `npm run test:mcp:e2e`（`SIDEKICK_E2E_OK`）
- `npm run copy:ensemble-sidekick`
- `git diff --check`

## 下一个 Agent 的待办事项

1. 提交前查看 `git status --short`；当前是上次 Antigravity commit 之后的新未提交 setup-output cleanup。
2. 如果提交，commit message 必须包含 “Claude, Codex, and Gemini”。
3. 如用户希望 `setup --json` 仍提供 copy-paste-ready config，可后续增加一个显式 `--expanded` 或 `--copyable` 选项，而不是默认重复模型名。

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| 用 `recommendedConfigTemplate` + `modelRef` 替代完整推荐 config | 保留推荐结构，同时避免把已在 discovery 中列出的模型名再次打印。 |
| `configuredModels` 不再包含主 `model` | `model` 字段已经表达当前选择；`configuredModels` 应只表示额外 allowlist。 |
| 只调整 setup/list 数据形状，不隐藏 discovery `models` | setup 仍需要完整模型列表供用户选择；冗余来自重复引用，不是 discovery 本身。 |

## 阻塞项

- 无。

## 建议下一步

下一步可提交本次 setup-output cleanup，或先让用户确认新的 `modelRef` 模板是否符合他们期望。
