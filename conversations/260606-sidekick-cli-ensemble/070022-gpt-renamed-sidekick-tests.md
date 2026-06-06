# 交接记录 — 070022 · gpt · renamed-sidekick-tests

## 继承的上下文

前两次交接已完成 `sidekick` command、`dist/sidekick.mjs`、`ensemble` skill bundle 集成和 stderr 进度输出。用户指出测试命名仍残留 `sidekick-cli` / `sidekickCore` 等旧名称，需要和重构后的脚本名称对应。

## 本次完成的工作

- [x] 将 standalone command 测试命名改为 `sidekick-command`。
- [x] 将 MCP E2E 明确命名为 `sidekick-mcp`。
- [x] 将 core 测试从 `sidekickCore.test.ts` 改为 `core.test.ts`。
- [x] 将 copy 脚本从 `copy-ensemble-cli.mjs` 改为 `copy-ensemble-sidekick.mjs`。
- [x] 更新 npm scripts，使用 `build:sidekick`、`copy:ensemble-sidekick`、`test:sidekick:*`、`test:mcp:*`。
- [x] 保留旧 `test:e2e*` 作为 MCP alias，避免破坏已有习惯。
- [x] 将 E2E marker 从 `SIDEKICK_CLI_*` 改为 `SIDEKICK_COMMAND_*`。

## 当前状态

| 文件 | 变更描述 |
| --- | --- |
| `package.json` | 重命名 build/copy/test scripts |
| `scripts/copy-ensemble-sidekick.mjs` | 新脚本名，复制 `dist/sidekick.mjs` 到 skill |
| `tests/core.test.ts` | 原 `sidekickCore.test.ts` |
| `tests/e2e-sidekick-command.mjs` | standalone `sidekick.mjs` fake E2E |
| `tests/e2e-sidekick-mcp.mjs` | MCP server fake E2E |
| `tests/real-sidekick-command-smoke.mjs` | standalone command real smoke |
| `tests/real-mcp-smoke.mjs` | MCP real smoke |
| `tasks/todo.md` / 当前交接文件 | 同步新命名 |

已运行并通过：

- `npm run lint`
- `npm test -- tests/cli.test.ts tests/core.test.ts tests/sourceBoundaries.test.ts`
- `npm run test:sidekick:e2e`（`SIDEKICK_COMMAND_E2E_OK`）
- `npm run test:mcp:e2e`（`SIDEKICK_E2E_OK`）
- `npm test`（15 files / 121 tests）
- `npm run copy:ensemble-sidekick`

## 下一个 Agent 的待办事项

1. 如需继续，可跑一次 `npm run test:sidekick:e2e:real` 确认重命名后的真实 command smoke；此前相同逻辑已通过 Claude sonnet。
2. 如需提交，记得 commit message 引用 “Claude, Codex, and Gemini”。

## 关键决策记录

| 决策 | 原因 |
| --- | --- |
| `test:sidekick:*` 表示 standalone `sidekick.mjs` command | 对应用户要求的 CLI public name `sidekick` |
| `test:mcp:*` 表示 MCP server path | 避免 `test:e2e` 名称无法区分 transport |
| 保留 `test:e2e*` alias 指向 MCP | 兼容已有项目习惯和 CI 可能使用的旧脚本名 |

## 阻塞项

- 无。

## 建议下一步

下一步做整体 diff review，确认命名一致性后提交。
