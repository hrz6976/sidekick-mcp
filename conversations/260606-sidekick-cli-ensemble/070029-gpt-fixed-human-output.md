# 交接记录 — 070029 · gpt · fixed-human-output

## 继承的上下文

此前 `sidekick run` 即使不带 `--json` 也把完整 JSON result 写到 stdout。用户指出这不符合 CLI 人类模式语义：不加 `--json` 应该直接输出 answer；错误时应输出指定错误横幅。

## 本次完成的工作

- [x] 修改 `sidekick run`：不带 `--json` 时 stdout 只输出最终 `answer`。
- [x] 保持 `sidekick run --json` 输出完整结构化 result JSON。
- [x] 修改顶层错误处理：不带 `--json` 时 stdout 输出 `!!! ERROR OCCURRED !!!\n{error}`。
- [x] 保持 `--json` 错误输出 `{ "error": "..." }`。
- [x] 更新 `tests/e2e-sidekick-command.mjs` 覆盖 human success 和 human error。
- [x] 重新复制最新 bundle 到 `C:\Users\hrz\.agents\skills\ensemble\bin\sidekick.mjs`。

## 当前状态

| 文件 | 变更描述 |
| --- | --- |
| `src/cli.ts` | 新增 human-mode answer 输出和 error banner 输出 |
| `tests/e2e-sidekick-command.mjs` | 验证无 `--json` 成功 stdout 只有 answer，错误 stdout 有指定 banner |
| `tasks/todo.md` | 记录本次输出语义修正 |
| `C:\Users\hrz\.agents\skills\ensemble\bin\sidekick.mjs` | 已复制最新 bundle，大小约 84.2 KB |

已运行并通过：

- `npm run lint`
- `npm run test:sidekick:e2e`（`SIDEKICK_COMMAND_E2E_OK`）
- `npm run copy:ensemble-sidekick`

## 下一个 Agent 的待办事项

1. 如需进一步确认，可以手动跑真实模型 no-json smoke，预期 stdout 只有模型 answer，stderr 有 `[sidekick] ...` 进度。
2. 如果提交，commit message 仍需引用 “Claude, Codex, and Gemini”。

## 关键决策记录

| 决策 | 原因 |
| --- | --- |
| `run` human mode stdout 只输出 answer | 符合常规 CLI 直读体验，也方便 shell 管道处理 |
| `--json` 继续输出完整 result/error JSON | `ensemble` skill 和自动化需要结构化 metadata/log paths |
| 非 JSON 错误写 stdout 而不是 stderr | 用户明确要求显示输出 `!!! ERROR OCCURRED !!!\n{error}`；进度仍走 stderr |

## 阻塞项

- 无。

## 建议下一步

下一步整体 review 当前 CLI 输出矩阵：setup/list/run/cleanup 的 JSON 与 human mode 是否都符合预期。
