# 交接记录 — 041429 · codex · researched-model-discovery

## 继承的上下文

继承 `conversations/2026-06-03-agent-task-mcp/041407-codex-updated-setup.md` 和 `tasks/lessons.md` 中关于模型发现的约束：

- `setup` 已是 always-on，不只是首次配置入口。
- 模型发现必须区分 live CLI catalog、bundled/static fallback、configured model、validated model。
- 不应把静态 fallback 或 provider catalog 叫作“currently available models”。

## 本次完成的工作

- [x] 读取本 thread 的交接记录和 `tasks/lessons.md`。
- [x] 核验本机 OpenCode 1.3.17 的 `opencode --help`、`opencode models --help`、`opencode models`、`opencode models --verbose`。
- [x] 核验本机 `opencode providers list`，观察到 credentials 与 `opencode models` 输出范围不同。
- [x] 克隆/更新 upstream `anomalyco/opencode` 到 `/fast/hrz/tmp-sources/anomalyco-opencode`，HEAD `70bb710`。
- [x] 阅读 upstream `packages/opencode/src/cli/cmd/models.ts`、`packages/opencode/src/provider/provider.ts`、`packages/core/src/models-dev.ts`。
- [x] 阅读当前 Sidekick `src/tools/sidekick.ts` 和 `src/runners/registry.ts` 的模型发现逻辑。
- [x] 设计四 runner 通用 schema，覆盖 `source`、`confidence`、`cost`、`network`、`quotaRisk`、`validation`。
- [x] 判断 `setup` / `list_agents` 应支持 `refresh` / `validate` / `includeMetadata`，且默认 false。
- [x] 写入目标报告文件。
- [x] 更新 `tasks/todo.md` 中 OpenCode/general model discovery 小节和 review/results。

## 当前状态

| 文件 | 变更描述 |
| ---- | -------- |
| `conversations/2026-06-03-agent-task-mcp/model-discovery-research/opencode-general-model-discovery.md` | 新增 OpenCode 与 Sidekick 通用模型发现调研报告 |
| `tasks/todo.md` | 追加并完成 OpenCode/general model discovery checklist 和 review/results |
| `conversations/2026-06-03-agent-task-mcp/041429-codex-researched-model-discovery.md` | 本交接记录 |

运行过的检查：

- `git diff --check -- tasks/todo.md conversations/2026-06-03-agent-task-mcp/model-discovery-research/opencode-general-model-discovery.md`：通过。

## 下一个 Agent 的待办事项

1. 如要实现报告建议，先改 `setup` / `list_agents` schema，默认 `refresh:false`、`validate:false`，不要改变现有 ask runner 行为。
2. 把 `availableModels` 类字段改名为 `discoveredModels` / `configuredModels` / `selectedModel` / `validation`。
3. OpenCode metadata 支持可以先放在 `includeMetadata:true` 路径，用 `opencode models --verbose` 解析 cost/context/capabilities。
4. validate 应只验证已配置 selected model，避免枚举验证消耗 quota。

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| `opencode models` 标为 provider-layer discovery | 源码打印 `Provider.Service.list()`，不是直接打印全量 models.dev catalog |
| 不把 `opencode models` 叫 validated | 命令未发起最小 prompt/API 调用，不能证明账号 entitlement、quota、region 均可用 |
| `refresh` / `validate` 默认 false | 默认 `setup` / `list_agents` 应保持轻量，不触发远程刷新或额度消耗 |
| schema 显式包含 network/quotaRisk | UX 需要清楚区分本地 cache、catalog refresh、真实 provider probe 的风险 |

## 阻塞项

- 无。

## 建议下一步

一句话：若继续开发，先实现结构化 discovery 返回值，再考虑 OpenCode `--verbose` metadata 和最小 validate probe。
