# 交接记录 — 070108 · gpt · refactored-trajectory

## 继承的上下文

本线程此前完成了 standalone `sidekick` CLI、ensemble skill 集成、human/stdout 语义、无默认超时、删除未使用 `title` 参数，以及实验性 ATIF trajectory 导出。用户随后明确要求两次结构调整：不要使用 `src/atif` 或简称 `traj`，导出模块应放在 runner 域内，并且文件名、变量名、测试名都使用完整 `trajectory`。

## 本次完成的工作

- [x] 将旧的 `traj`/`atif` 命名统一改为完整 `trajectory` 命名。
- [x] 将共享 ATIF v1.7 trajectory 类型、builder、writer 合并到 `src/runners/trajectory.ts`。
- [x] 将 runner-specific trajectory step 提取放入各 runner 文件，保留低耦合继承关系：`BaseRunner` 默认返回空 steps，各具体 runner 覆盖 `buildTrajectorySteps()`。
- [x] 更新 CLI/core/E2E/real-smoke/source-boundary 测试命名和导入。
- [x] 确认 `~/.sidekick` 默认路径在 Windows 下通过 `os.homedir()` + `path.join()` 生成，兼容 Windows 路径。
- [x] 运行完整验证并复制最新 bundle 到 ensemble skill。

## 当前状态

| 文件 | 变更描述 |
| --- | --- |
| `src/runners/trajectory.ts` | 共享 trajectory 类型、ATIF v1.7 builder、writer 和辅助函数；无 MCP 依赖。 |
| `src/runners/base.ts` | 为 runner 继承层提供默认 `buildTrajectorySteps()`。 |
| `src/runners/claude.ts` | 从 Claude stdout JSONL best-effort 提取 agent/tool/observation trajectory steps。 |
| `src/runners/codex.ts` | 从 Codex stdout JSONL best-effort 提取 message、tool call、observation steps。 |
| `src/runners/gemini.ts` | 从 Gemini stdout JSONL/text events best-effort 提取 trajectory steps。 |
| `src/runners/opencode.ts` | 从 OpenCode stdout JSONL best-effort 提取 message/tool/observation steps。 |
| `src/runners/types.ts` | 增加 runner trajectory step request/type contract。 |
| `src/tasks/runCoordinator.ts` | 在 task 运行结束或失败时调用 runner-specific step builder，并写出 trajectory。 |
| `tests/trajectory.test.ts` | 覆盖成功和失败 trajectory shape。 |
| `tests/cli.test.ts` | 覆盖 `--trajectory` 可选参数解析。 |
| `tests/core.test.ts` | 覆盖默认 `<taskDir>/trajectory.json` 导出。 |
| `tests/e2e-sidekick-command.mjs` | 覆盖 fake CLI default/explicit/human/failure trajectory 场景。 |
| `tests/real-sidekick-command-smoke.mjs` | real model smoke 增加 trajectory shape 验证。 |
| `C:\Users\hrz\.agents\skills\ensemble\bin\sidekick.mjs` | 已复制最新 bundle。 |

验证已通过：

- `npm run lint`
- `npm test -- tests/cli.test.ts tests/trajectory.test.ts tests/core.test.ts tests/sourceBoundaries.test.ts`
- `npm run build`
- `npm test`（16 files / 125 tests）
- `npm run test:sidekick:e2e`（`SIDEKICK_COMMAND_E2E_OK`）
- `npm run test:mcp:e2e`（`SIDEKICK_E2E_OK`）
- `npm run test:sidekick:e2e:real`（`SIDEKICK_REAL_COMMAND_SMOKE_OK agent=claude model=sonnet`）
- `npm run copy:ensemble-sidekick`
- `git diff --check` 仅有 CRLF normalization warnings
- stale naming scan 未发现 `traj` / `Traj` / `src/atif` / `tests/atif` / `trajBuilder` 残留

## 下一个 Agent 的待办事项

1. 如果继续增强 trajectory fidelity，优先比较 Harbor 对 Claude/Codex/Gemini/OpenCode session 文件的转换逻辑，再决定是否让 Sidekick 读取 runner 原生日志文件；不要为了表面一致硬塞不可验证字段。
2. 若准备提交 PR，先检查所有 untracked files，确认旧 `tests/e2e-sidekick.mjs` / `tests/real-model-smoke.mjs` 删除和新脚本命名是预期替换。
3. 提交前再次运行 `npm run lint && npm test && npm run build && npm run test:sidekick:e2e && npm run test:mcp:e2e`；real smoke 会消耗模型额度，按需运行。

## 关键决策记录

| 决策 | 原因 |
| --- | --- |
| 使用完整 `trajectory` 命名，不再使用 `traj` | 用户明确纠正；全称更适合作为 public/experimental surface 和长期模块名。 |
| 共享实现放在 `src/runners/trajectory.ts` | 用户希望 `src/traj` 的东西写成 runner 域内文件，并合并 builder。 |
| 各 agent 的 step 提取放在各自 runner 文件 | 用户要求 agent-specific 实现放到对应 agent 文件里，并保持低耦合继承关系。 |
| Harbor 对齐采用语义对齐而非强制完全复制 | Sidekick 当前可靠输入是 stdout JSONL 和 task metadata，不一定拥有 Harbor 使用的完整原生 session 文件；因此只对齐 ATIF step/source/tool/observation/final metrics 语义。 |
| 默认 `~/.sidekick` 兼容 Windows | 默认路径通过 `os.homedir()` 和 `path.join()` 生成，例如 `C:\Users\hrz\.sidekick`；环境变量若手写 `~` 则不会由 Node 自行展开。 |

## 阻塞项

- 无。

## 建议下一步

下一位 Agent 接手后应先查看 `git status --short` 和 `src/runners/trajectory.ts`，确认是否需要提交当前完整 CLI/trajectory 变更。
