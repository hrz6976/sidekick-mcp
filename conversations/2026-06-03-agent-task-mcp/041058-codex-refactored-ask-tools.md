# 交接记录 — 041058 · codex · refactored-ask-tools

## 继承的上下文

继承本 thread 中 Sidekick MCP 重构、命名 correction、四 agent E2E 验证记录。用户进一步调整设计：

- 不再保留通用 `sidekick_start_task`。
- 不再使用 `sidekick_` 管理工具前缀。
- 配置文件只保留一个 `agents` map。
- 每个 `agents` key 是用户可调用的 helper agent，并生成 `ask_<agent>` 工具。
- `runner` 才是底层 CLI：`claude`、`gemini`、`codex`、`opencode`。
- setup prompt 和 tool prompt/description 要指导：
  - read-only 通常不需要 worktree。
  - edit/full-access 建议使用 worktree 避免并发改动。
  - Gemini 的 `--skip-trust` 是默认 runner 选项。
  - `extraArgs` 可用于 thinking/reasoning effort 等高级参数。

## 本次完成的工作

- [x] `src/config.ts` 改为 config-generated agent model：
  - `agents: Record<string, AgentConfig>`
  - `AgentConfig.runner`
  - `AgentConfig.model`
  - `AgentConfig.extraArgs`
  - `AgentConfig.description`
  - 删除 active config 中的 `defaultAgent` / `defaultModels`
- [x] `src/tools/sidekick.ts` 重写：
  - 缺配置只暴露 `setup`
  - 有配置时暴露 `ask_<agent>`、`list_agents`、`cleanup_worktree`
  - 每个 `ask_<agent>` 为 MCP Tasks required
  - readonly 默认 `worktree: "off"`
  - edit/full-access 默认按 config 用 `worktree: "auto"`
  - task result 记录 `agent` 和 `runner`
- [x] `src/runners/types.ts` / `src/runners/registry.ts` / `src/worktrees/manager.ts` / `src/tasks/metadataStore.ts` 更新为 `RunnerName` 和 public agent name 分离。
- [x] `tests/e2e-sidekick.mjs` 更新为 `setup` / `ask_*` / `list_agents` / `cleanup_worktree`。
- [x] `tests/real-model-smoke.mjs` 更新为 `ask_<runner>`，并移除配置层 Gemini `--skip-trust`。
- [x] 更新 `README.md`、`CHANGELOG.md`、`AGENTS.md`、`install.sh`、`tests/TESTS.md`。
- [x] 更新 unit tests；新增 readonly 默认不建 worktree 的回归测试。
- [x] 更新 `tasks/todo.md`。

## 当前状态

| 文件 | 变更描述 |
| ---- | -------- |
| `src/config.ts` | 新 agent map config schema |
| `src/tools/sidekick.ts` | config-generated ask tools 和 unprefixed management tools |
| `src/runners/types.ts` | runner/public agent 分离 |
| `src/tasks/metadataStore.ts` | metadata 记录 `agent` + `runner` |
| `src/worktrees/manager.ts` | worktree 以 runner 判断 native/managed |
| `tests/serverApp.test.ts` | 新工具面和 readonly worktree 行为 |
| `tests/e2e-sidekick.mjs` | built-server fake E2E 使用 ask tools |
| `tests/real-model-smoke.mjs` | real smoke 使用 ask tools |
| `README.md` | 新配置和工具面文档 |

## 验证结果

已通过：

- `npm run lint`
- `npm test`：12 files / 98 tests
- `npm run test:e2e`：`SIDEKICK_E2E_OK`
- `npm run test:e2e:real:all`
  - `SIDEKICK_REAL_MODEL_SMOKE_OK agent=claude model=sonnet`
  - `SIDEKICK_REAL_MODEL_SMOKE_OK agent=gemini model=`
  - `SIDEKICK_REAL_MODEL_SMOKE_OK agent=codex model=`
  - `SIDEKICK_REAL_MODEL_SMOKE_OK agent=opencode model=`
- `npm run build`
- `npx --yes knip`
- 旧命名/旧工具扫描：无 `sidekick_start_task`、`sidekick_list_models`、`sidekick_cleanup_worktree`、`sidekick_setup`、`defaultAgent`、`defaultModels`、`SIDEKICK_MCP` 等残留（排除 conversations/node_modules/dist）。

## 下一个 Agent 的待办事项

1. 如果继续优化，可考虑给 `list_agents` 输出补充 server/client namespace 说明，但当前功能已通。
2. 若用户要求提交/PR，commit/PR 文案需包含 “Claude, Codex, and Gemini” authorship reference。

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| 不保留通用 ask tool | 用户希望减少调用参数和工具选择歧义，直接暴露 `ask_<agent>` |
| 管理工具去掉 `sidekick_` 前缀 | 主流 MCP clients 已能区分 server 来源，重复前缀啰嗦 |
| `agents` 是 public helper-agent map | 用户视角里 `deepseek`/`kimi` 就是 agent，runner 是实现细节 |
| Gemini `--skip-trust` 默认注入 | 用户要求变成默认选项，setup 不再要求手动配置 |
| readonly 默认 no worktree | read-only 分析不需要隔离 checkout；edit/full-access 才建议 worktree |

## 阻塞项

- 无。

## 建议下一步

一句话：可以进入 review；当前 public contract 是 `setup`、`list_agents`、`cleanup_worktree` 和配置生成的 `ask_<agent>`。
