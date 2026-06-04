# 交接记录 — 041402 · codex · cleaned-results

## 继承的上下文

继承 `041332-codex-complete-progress.md` 与用户反馈：`ask_<agent>` 之前把 raw CLI stdout 直接塞进最终 MCP tool result，导致 Claude 看到一大坨 Gemini JSONL。目标是让 Sidekick 的最终结果更像 side agent 工作产物，而不是终端转储。

## 本次完成的工作

- [x] 新增 runner-aware final answer extraction。
- [x] `ask_<agent>` 最终返回 `answer` 和元数据，不再返回 raw `stdout`。
- [x] raw stdout 继续保存在 `stdout.log`。
- [x] 修复 completion 时重复 append stdout 的问题。
- [x] 更新测试、E2E 和 README。

## 当前状态

| 文件 | 变更描述 |
| ---- | -------- |
| `src/runners/output.ts` | 新增 Claude/Gemini/Codex/OpenCode JSONL/stdout answer extractor |
| `src/tools/sidekick.ts` | 返回 `answer`/`stats`，移除 response 中的 raw `stdout`；只补写缺失 stdout |
| `tests/outputExtraction.test.ts` | 新增四类 runner 输出提取测试 |
| `tests/serverApp.test.ts` | 更新 direct/task ask result contract |
| `tests/e2e-sidekick.mjs` | 验证 built MCP server 返回 clean answer，raw marker 仍在 stdout log |
| `tests/real-model-smoke.mjs` | 真实模型 smoke 断言 `answer` 而不是 `stdout` |
| `README.md` | 说明 raw CLI stdout 只保存在 task logs |
| `tasks/todo.md` | 记录本轮 review/results |

## 验证结果

- `npm test -- tests/outputExtraction.test.ts tests/serverApp.test.ts`
- `npm run lint`
- `npm test`：14 files / 111 tests
- `npm run build`
- `npm run test:e2e`
- `git diff --check`

## 下一个 Agent 的待办事项

1. 如果继续改善 OpenCode 短 timeout 体验，优先设计应用层 job API：`start_run` / `get_run` / `list_runs` / `cancel_run`。
2. 如果要进一步提高 answer extraction 精度，可用真实 Claude/Codex/OpenCode JSONL 样本扩展 `tests/outputExtraction.test.ts`。
3. 如果发布前做 real smoke，需要重新运行 `npm run test:e2e:real:all`，会消耗本机 provider quota。

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| 最终 result 保持 JSON 外层 | 保留现有工具结果的结构化元数据风格，降低契约迁移成本 |
| raw stdout 不再出现在 tool response | 调用方 agent 需要结论，不需要默认阅读 provider JSONL transcript |
| raw stdout 继续写 `stdout.log` | 保留调试和审计能力 |
| completion 只补写缺失 stdout | 避免真实执行路径中 chunk logging 和 final append 重复 |

## 阻塞项

- 无。

## 建议下一步

一句话：下一步若要解决 OpenCode timeout，应在 clean `answer` 契约之上增加普通 MCP tools 的 job manager，而不是回退到 raw stdout。
