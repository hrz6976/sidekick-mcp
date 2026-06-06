# 交接记录 — 061614 · codex · fixed-arch-issues

## 继承的上下文

本轮接续 `conversations/2026-06-06-project-simplification/061601-claude-reviewed-arch-issues.md`。Claude review 指出 5 个架构问题：

- `cliDetector.ts` 仍硬编码四个 runner CLI 名称。
- `worktrees/create.ts` 仍硬编码 Claude/Gemini native worktree 判断。
- `worktrees/` 拆得过碎，`git.ts`、`naming.ts`、`manager.ts` indirection 收益低。
- `buildRecommendedConfig` 仍硬编码 runner-specific setup recommendation。
- `constants.ts` 中 `CLI.COMMANDS` 已无必要。

本轮目标是修复这些问题，同时保持 config、MCP tools、runner args、worktree semantics、task result shape、setup starter config behavior 不变。

## 本次完成的工作

- [x] `AgentRunner` 新增 `defaultCommand`、`worktreeSupport`、`recommendedAgents()`、`fallbackRecommendationModels`。
- [x] `BaseRunner` 提供 `defaultCommand = name`、managed worktree 默认值、通用 recommendation 默认实现。
- [x] Claude/Gemini runner 声明 `worktreeSupport = 'native'`。
- [x] Codex/OpenCode 继续使用 managed worktree 默认值。
- [x] Gemini/OpenCode runner 持有 no-CLI fallback recommendation models，保留 starter config 中 Gemini + DeepSeek 的行为。
- [x] OpenCode runner 持有 DeepSeek/Kimi recommendation selection logic，避免 `sidekick.ts` 维护 OpenCode-specific branching。
- [x] `cliDetector.ts` 改为接受 runner probes，遍历 `defaultCommand` 检测 PATH。
- [x] `tools/index.ts` 调用 `detectAvailableClis(getRunnerAdapters(), ...)`。
- [x] 删除 `constants.ts` 中 stale `CLI.COMMANDS`。
- [x] `TaskRunCoordinator` 将 `runner.worktreeSupport` 传给 worktree creation。
- [x] 将 worktree implementation 合并到 `src/worktrees/index.ts`，删除 `create.ts`、`cleanup.ts`、`git.ts`、`naming.ts`、`manager.ts`。
- [x] 保留 `src/worktrees/types.ts` 作为 shared type boundary。
- [x] 更新 tests：CLI detector、worktree manager、runner capabilities、source boundaries。
- [x] 更新 `tasks/todo.md` 的 Architecture Review Resolution section。

## 当前状态

验证已通过：

- `npm run lint`
- focused Vitest subset：
  - `tests/utils/cliDetector.test.ts`
  - `tests/worktreeManager.test.ts`
  - `tests/runners.test.ts`
  - `tests/sourceBoundaries.test.ts`
  - `tests/serverApp.test.ts`
  - `tests/tools/initTools.test.ts`
- `npm test`（13 files / 111 tests）
- `npm run build`
- `npm run test:e2e`（`SIDEKICK_E2E_OK`）
- `git diff --check`

当前 worktree 仍未提交，包含整个 project simplification 累积 diff。

| 文件 | 变更描述 |
| ---- | -------- |
| `src/runners/types.ts` | runner interface 增加 default command、worktree support、recommendation capabilities |
| `src/runners/base.ts` | 提供 default command、managed worktree default、generic recommendation helper |
| `src/runners/claude.ts` | native worktree support + Claude setup recommendation ownership |
| `src/runners/gemini.ts` | native worktree support + Gemini setup/fallback recommendation ownership |
| `src/runners/codex.ts` | Codex setup recommendation ownership |
| `src/runners/opencode.ts` | OpenCode DeepSeek/Kimi recommendation ownership |
| `src/utils/cliDetector.ts` | runner-probe based CLI detection |
| `src/tools/index.ts` | passes `getRunnerAdapters()` into CLI detector |
| `src/tools/sidekick.ts` | setup recommendation builder iterates runners; no OpenCode/Gemini/Codex/Claude recommendation branches |
| `src/tasks/runCoordinator.ts` | passes runner worktree support into worktree creation |
| `src/worktrees/index.ts` | merged worktree create/cleanup/git/naming implementation |
| `src/worktrees/types.ts` | `WorktreeRequest` includes `worktreeSupport` |
| `src/worktrees/create.ts` / `cleanup.ts` / `git.ts` / `naming.ts` / `manager.ts` | deleted |
| `src/constants.ts` | removed `CLI.COMMANDS` |
| `tests/utils/cliDetector.test.ts` | tests adapter-driven default command probing |
| `tests/runners.test.ts` | tests runner worktree support and recommendation ownership |
| `tests/sourceBoundaries.test.ts` | tests worktree creation is capability-driven, not runner-name driven |
| `tests/worktreeManager.test.ts` | updated for new worktree request shape/import |
| `tasks/todo.md` | records review resolution and verification |

## 下一个 Agent 的待办事项

1. If preparing a commit, review the full accumulated diff first. It includes HTTP/service deletion, runner class split, runner parser/renderer ownership, task/worktree modularization, and this architecture review resolution.
2. Stage all untracked files carefully, especially `src/runners/*.ts`, `src/tasks/*.ts`, `src/worktrees/index.ts`, `src/worktrees/types.ts`, `tests/sourceBoundaries.test.ts`, and all `conversations/2026-06-06-project-simplification/*.md`.
3. Commit/PR message must include "Claude, Codex, and Gemini" authorship reference.
4. Optional pre-commit extra: run `npx --yes knip` to catch unused exports/files after the large deletion/refactor.

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| `detectAvailableClis` 接受 runner probes 而不是 import registry 自己查 | 调用方显式传入 adapters，避免 utils 层主动拥有 registry 依赖；新增 runner 通过 registry array 自动参与检测 |
| `worktreeSupport` 放在 runner interface | native-vs-managed 是 runner capability，不是 worktree domain 应该硬编码的 runner identity |
| `WorktreeRequest` 传 `worktreeSupport` 而不是完整 runner object | worktree domain 不需要依赖 runner domain；只需要一个 small capability flag |
| 将 worktree implementation 合并为 `index.ts`，保留 `types.ts` | 实现体量约 130 行，单文件更易读；types 被 runner/task domain 共享，保留单独边界合理 |
| setup recommendation 由 runner classes 提供 | setup UX 是 runner-specific behavior；放回 runner 文件后新增 runner 不需要改 `sidekick.ts` 的 recommendation branches |
| 保留 Gemini + DeepSeek no-CLI fallback starter config | 这是之前 setup UX 的用户可见行为；通过 runner-owned `fallbackRecommendationModels` 保持行为而不在 `sidekick.ts` 硬编码 |

## 阻塞项

- 无。

## 建议下一步

一句话：下一个 Agent 接手后先做完整 diff review 和可选 `knip` audit，再按用户要求决定是否 commit / push / PR。
