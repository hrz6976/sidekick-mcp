# 交接记录 — 061533 · codex · refactored-parser-renderers

## 继承的上下文

本轮接续 `061522-codex-refactored-runners.md`。用户进一步指出 `registry.ts`、`progress.ts`、`output.ts` 仍有 runner-specific variables/functions，要求继续推进拆分。

## 本次完成的工作

- [x] 将 `src/runners/output.ts` 收敛为 generic output utilities。
- [x] 将 `src/runners/progress.ts` 收敛为 generic progress utilities。
- [x] 将 Claude/Gemini/Codex/OpenCode 的 output extraction 和 progress rendering 移到各自 runner class 文件。
- [x] 将 `registry.ts` 的 lookup map 改为从 runner instance array 派生。
- [x] 更新 output/progress focused tests，使其通过 `getRunner(...).extractOutput()` / `createProgressRenderer()` 验证行为。
- [x] 增加 source-shape regression test，确保 `output.ts` 和 `progress.ts` 不再出现 runner names 或 `RunnerName`。

## 当前状态

验证已通过：

- `npm run lint`
- `npm test`（12 files / 108 tests）
- `npm run build`
- `npm run test:e2e`（`SIDEKICK_E2E_OK`）
- `git diff --check`

| 文件 | 变更描述 |
| ---- | -------- |
| `src/runners/output.ts` | 仅保留 `ExtractedRunOutput`、JSONL parsing、fallback answer、`TextAccumulator`、shared path/string helpers |
| `src/runners/progress.ts` | 仅保留 `CliProgressRenderer`、JSON-line renderer、preview/path/token/tool helpers |
| `src/runners/claude.ts` | 新增 Claude output extraction 和 progress rendering ownership |
| `src/runners/gemini.ts` | 新增 Gemini output extraction 和 progress rendering ownership |
| `src/runners/codex.ts` | 新增 Codex output extraction 和 progress rendering ownership |
| `src/runners/opencode.ts` | 新增 OpenCode output extraction 和 progress rendering ownership |
| `src/runners/registry.ts` | `RUNNERS` 由 built-in runner instance array 派生 |
| `tests/outputExtraction.test.ts` | 改为通过 runner instance 测 output extraction |
| `tests/progressRenderer.test.ts` | 改为通过 runner instance 测 progress rendering |
| `tests/runners.test.ts` | 增加 shared module generic regression assertion |
| `tasks/todo.md` | 更新 Project Simplification results |

## 下一个 Agent 的待办事项

1. 若准备提交，务必 stage 新增 untracked runner files：`base.ts`、`claude.ts`、`gemini.ts`、`codex.ts`、`opencode.ts`。
2. 完整 diff 同时包含 HTTP/service 删除、runner class split、parser/renderer ownership move，以及前序 Claude review fixes；commit 前建议人工 review 一遍。
3. Commit/PR 仍必须包含 "Claude, Codex, and Gemini" authorship reference。

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| 删除 `extractRunOutput` / `createCliProgressRenderer` | 它们是内部集中分发 helper；app code 已经走 runner instance，focused tests 可通过 registry 验证 |
| 保留 shared helper exports | 避免每个 runner 重复 JSONL parsing、fallback answer、preview、token stats 等通用 plumbing |
| 每个 concrete runner 自己渲染 progress event | 用户要求 runner-specific logic 不再集中在 `progress.ts` |
| registry map 从 runner instance array 派生 | 避免 registry 同时维护 hard-coded key/object layout 和 runner imports |

## 阻塞项

- 无。

## 建议下一步

一句话：下一步做完整 diff review，然后 stage 新 runner files 和所有相关修改再提交。
