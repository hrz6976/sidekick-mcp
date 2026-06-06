# 交接记录 — 061548 · codex · refactored-task-worktrees

## 继承的上下文

本轮接续 `conversations/2026-06-06-project-simplification/061533-codex-refactored-parser-renderers.md`。此前已经完成：

- 删除 HTTP/service/daemon，Sidekick 只保留 stdio MCP server。
- 将 runner 抽象推进为 `BaseRunner` + Claude/Gemini/Codex/OpenCode 单独文件。
- 将 runner-specific output extraction 和 progress rendering 移入各自 runner class。
- `output.ts` / `progress.ts` 已收敛为 generic utilities。

用户随后问是否可以对 `taskStore`、`metadataStore`、`worktrees` 做类似 modularization，并要求完成后写 handoff。本轮目标是继续推动边界清晰化，同时保持 config、MCP tools、task metadata、worktree behavior、CLI args、result shape 不变。

## 本次完成的工作

- [x] 将 root-level `src/taskStore.ts` 移到 `src/tasks/protocolTaskStore.ts`，让 protocol task/cancel handling 归属 tasks domain。
- [x] 新增 `src/tasks/runCoordinator.ts`，集中 ask task 执行生命周期：worktree creation、metadata/log/result writes、progress rendering、answer extraction、failure/cancel state updates。
- [x] 将 worktree internals 拆为 `create.ts`、`cleanup.ts`、`git.ts`、`naming.ts`、`types.ts`。
- [x] 将 `src/worktrees/manager.ts` 收敛为 public facade，继续导出 `createWorktree` / `cleanupWorktree` / public types。
- [x] 将 `WorktreeHandle` 从 runner types 移到 `src/worktrees/types.ts`，由 runner/task metadata 共享。
- [x] 更新 `src/tools/sidekick.ts`，ask tool 只负责 schema parsing、effort validation、mode/worktree resolution，然后委托 `TaskRunCoordinator`。
- [x] 新增 `tests/sourceBoundaries.test.ts`，防止 worktree manager 重新长出实现细节，防止 ask lifecycle 回流到 `sidekick.ts`。
- [x] 更新 `tasks/todo.md` 的 Task / Worktree Modularization checklist 和结果。

## 当前状态

验证已全部通过：

- `npm run lint`
- `npm test`（13 files / 110 tests）
- `npm run build`
- `npm run test:e2e`（`SIDEKICK_E2E_OK`）
- `git diff --check`

当前 worktree 仍未提交，包含本轮和前序 simplification 改动；新增文件需要 staging。

| 文件 | 变更描述 |
| ---- | -------- |
| `src/tasks/protocolTaskStore.ts` | 新位置：MCP protocol task store / cancel handler state |
| `src/tasks/runCoordinator.ts` | 新增：ask task run lifecycle coordinator |
| `src/taskStore.ts` | 已删除，避免 root-level task store 混在项目顶层 |
| `src/tools/sidekick.ts` | ask tool 委托 `TaskRunCoordinator`；保留 setup/list_agents/cleanup wiring |
| `src/worktrees/types.ts` | 新增 shared worktree request/handle/cleanup types |
| `src/worktrees/create.ts` | 新增 managed/native/off worktree creation logic |
| `src/worktrees/cleanup.ts` | 新增 cleanup logic |
| `src/worktrees/git.ts` | 新增 worktree-local git command helper |
| `src/worktrees/naming.ts` | 新增 task id shortening、repo hash、worktree name helpers |
| `src/worktrees/manager.ts` | 变为 re-export facade |
| `src/runners/types.ts` | 使用 `WorktreeHandle` from worktrees domain |
| `src/tasks/metadataStore.ts` | 使用 `WorktreeHandle` from worktrees domain |
| `src/serverApp.ts` | 使用 `ManagedTaskStore` from `tasks/protocolTaskStore` |
| `tests/runners.test.ts` | 更新 worktree type import |
| `tests/sourceBoundaries.test.ts` | 新增 boundary regression coverage |
| `tasks/todo.md` | 记录本轮 plan、checklist、verification results |

## 下一个 Agent 的待办事项

1. 如需提交，先完整 review `git diff`，因为当前 diff 同时包含 HTTP/service 删除、runner class split、runner parser/renderer split、本轮 task/worktree split，以及更早的 Claude review-resolution 改动。
2. Stage 时不要漏掉 untracked files，尤其是：
   - `src/runners/base.ts`
   - `src/runners/claude.ts`
   - `src/runners/gemini.ts`
   - `src/runners/codex.ts`
   - `src/runners/opencode.ts`
   - `src/tasks/protocolTaskStore.ts`
   - `src/tasks/runCoordinator.ts`
   - `src/worktrees/*.ts`
   - `tests/sourceBoundaries.test.ts`
   - `conversations/2026-06-06-project-simplification/*.md`
3. Commit/PR message 仍必须包含 "Claude, Codex, and Gemini" authorship reference。
4. 可选：提交前运行一次 `npx --yes knip` 做 unused export/file audit；本轮未运行 knip，但 TypeScript、unit、build、fake E2E、diff check 已通过。

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| `TaskRunCoordinator` 放在 `src/tasks/` | 执行生命周期主要围绕 task metadata、logs、result、cancel/failure state；放在 tools 层会让 MCP schema wiring 和 task domain 混在一起 |
| `manager.ts` 保持 facade | 现有 callers/tests 可以继续从 stable public surface import，同时 implementation 文件变小、更容易审查 |
| `WorktreeHandle` 归属 `src/worktrees/types.ts` | worktree handle 是 worktree domain 的 public type，不应由 runner types 定义再被 tasks 反向依赖 |
| 不拆 `metadataStore.ts` | 它当前已经是 focused file，负责 persisted task metadata/log paths；继续拆会增加 indirection，收益不如 coordinator/worktree split 明显 |
| 增加 scan-style boundary test | 这类架构简化容易在后续修 bug 时回流；小测试能守住 ownership boundary，成本低 |

## 阻塞项

- 无。

## 建议下一步

一句话：下一个 Agent 接手后先做完整 diff review，然后按用户意图 stage/commit，并确保 commit 或 PR 说明包含 "Claude, Codex, and Gemini" authorship reference。
