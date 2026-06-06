# 交接记录 — 070031 · gpt · removed-title-param

## 继承的上下文

用户询问当前 `title` 参数用途。全库检索显示，`title` 只从 MCP ask schema / `sidekick run --title` 传到 task metadata 的 `title` 字段，没有参与 prompt、runner 命令、progress、cleanup 或用户展示。

## 本次完成的工作

- [x] 删除 `sidekick run --title` 参数和 usage 文案。
- [x] 删除 MCP ask tool schema 的 `title` 字段。
- [x] 删除 `SidekickRunAgentRequest`、`SidekickTaskRunRequest`、`SidekickTaskMetadata` 中的 `title`。
- [x] 删除 run coordinator 写 metadata 时的 `title`。
- [x] 删除 real smoke 中传入的 title 参数。
- [x] 确认残留 `title` 只属于 OpenCode progress JSON event，不是 Sidekick public 参数。
- [x] 重新复制最新 bundle 到 `C:\Users\hrz\.agents\skills\ensemble\bin\sidekick.mjs`。

## 当前状态

| 文件 | 变更描述 |
| --- | --- |
| `src/cli.ts` | 移除 `--title` |
| `src/tools/sidekick.ts` | MCP ask schema 移除 `title` |
| `src/core/run.ts` | run request 移除 `title` |
| `src/tasks/runCoordinator.ts` | 不再写 metadata title |
| `src/tasks/metadataStore.ts` | metadata type 移除 title |
| `tests/real-mcp-smoke.mjs` / `tests/real-sidekick-command-smoke.mjs` | 移除 title 参数 |
| `tasks/todo.md` | 记录删除原因和验证 |

已运行并通过：

- `npm run lint`
- `npm test -- tests/core.test.ts tests/cli.test.ts tests/serverApp.test.ts tests/tools/initTools.test.ts`
- `npm run test:sidekick:e2e`（`SIDEKICK_COMMAND_E2E_OK`）
- `npm run test:mcp:e2e`（`SIDEKICK_E2E_OK`）
- `npm run copy:ensemble-sidekick`

## 下一个 Agent 的待办事项

1. 如需要进一步瘦身，可以继续检索 task metadata 中是否还有仅存档但无消费价值的字段。
2. 提交前做整体 diff review。

## 关键决策记录

| 决策 | 原因 |
| --- | --- |
| 删除 `title` 而不是保留 | 它没有实际行为价值，只增加 CLI/MCP public surface 和 metadata 噪声 |
| 保留 OpenCode progress event 的 `title` 局部变量 | 那是第三方 CLI event 字段，用于渲染工具进度，不是 Sidekick 参数 |

## 阻塞项

- 无。

## 建议下一步

下一步整体 review public surface：`prompt`、`mode`、`worktree`、`effort` 是否就是当前需要保留的最小 ask/run 参数集。
