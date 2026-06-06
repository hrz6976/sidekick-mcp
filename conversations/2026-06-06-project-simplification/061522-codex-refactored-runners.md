# 交接记录 — 061522 · codex · refactored-runners

## 继承的上下文

本轮接续 `conversations/2026-06-06-project-simplification/061510-codex-complete-simplification.md`。用户指出上一轮 runner 抽象仍然“all together”，明确要求实现更强的拆分：使用 base class，并将 OpenCode、Gemini、Codex、Claude 拆到不同文件；随后用户补充要求保持简单，只使用一个 `discoverModels(config, context)`。

## 本次完成的工作

- [x] 新增 `BaseRunner`，集中 `run()`、`listModels()`、默认 `discoverModels()` 和共享 argv / validation helper。
- [x] 新增独立 runner 文件：Claude、Gemini、Codex、OpenCode。
- [x] 将 `registry.ts` 缩减为纯 runner lookup / enumeration。
- [x] 保持现有 config、MCP tool、task/worktree、output/progress 行为不变。
- [x] 更新 runner regression test，确认四个 registry entries 都是 `BaseRunner` class-backed instances。

## 当前状态

验证已通过：

- `npm run lint`
- `npm test -- tests/runners.test.ts`
- `npm test`（12 files / 107 tests）
- `npm run build`
- `npm run test:e2e`（`SIDEKICK_E2E_OK`）
- `git diff --check`

| 文件 | 变更描述 |
| ---- | -------- |
| `src/runners/base.ts` | 新增 abstract base class，共享执行、模型列表 fallback、默认 `discoverModels` 和 helper |
| `src/runners/claude.ts` | Claude runner class，fallback aliases、permission mode、effort flag |
| `src/runners/gemini.ts` | Gemini runner class，fallback aliases、approval mode、`--skip-trust` |
| `src/runners/codex.ts` | Codex runner class，sandbox、effort config、`discoverModels` bundled catalog parsing |
| `src/runners/opencode.ts` | OpenCode runner class，variant effort、`discoverModels` provider model parsing |
| `src/runners/registry.ts` | 仅保留 import + `RUNNERS` + `getRunner` / `getRunnerAdapters` |
| `tests/runners.test.ts` | 增加 `BaseRunner` instance assertion |
| `tasks/todo.md` | 记录 runner abstraction 已 refined 为 class hierarchy |

## 下一个 Agent 的待办事项

1. 若继续收尾，先 review 当前完整 diff，因为它包含上一轮 HTTP/service 删除、review-resolution 改动，以及本轮 runner class split。
2. 如需 commit，注意新 runner files 是 untracked，必须纳入 staging。
3. Commit/PR 仍必须包含 "Claude, Codex, and Gemini" authorship reference。

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| 使用 `BaseRunner` abstract class | 用户明确偏好 base class + per-agent files；比单文件 object adapter 更清晰 |
| 只保留一个 `discoverModels(config, context)` hook | 用户明确要求简单；Codex/OpenCode override，Claude/Gemini 使用 base fallback |
| 不改变 `AgentRunner` public shape | 避免波及 `sidekick.ts`、tests、tool behavior |
| 保留 output/progress utility exports | 现有 focused tests 仍覆盖这些 utility；应用路径通过 runner instance 调用 |

## 阻塞项

- 无。

## 建议下一步

一句话：下一步若要交付，做一次完整 diff review，然后 stage 新 runner files 和相关修改再 commit。
