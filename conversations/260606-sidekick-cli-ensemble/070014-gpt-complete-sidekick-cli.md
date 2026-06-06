# 交接记录 — 070014 · gpt · complete-sidekick-cli

## 继承的上下文

本线程是为“把 Sidekick 做成随 `ensemble` skill 分发的非 MCP CLI primitive”创建的新交接线程。之前的计划已明确：CLI 不是 ensemble orchestrator，只负责 setup/list/run/cleanup；`ensemble` skill 继续负责并发、隔离输出文件和综合报告。用户随后修正了三点：CLI 命令名应为 `sidekick`，bundle 应为 `sidekick.mjs`；需要重新划分模块；需要加入真实模型测试。

## 本次完成的工作

- [x] 新增 MCP-free `sidekick` CLI，支持 `setup`、`list`、`run`、`cleanup`。
- [x] 将初版大文件拆成 `src/core/` 下的按领域模块。
- [x] 保留 MCP server 行为，并让 `src/tools/sidekick.ts` 复用 core API。
- [x] 新增 esbuild 单文件 bundle：`dist/sidekick.mjs`。
- [x] 复制 bundle 到 `C:\Users\hrz\.agents\skills\ensemble\bin\sidekick.mjs`。
- [x] 更新 `ensemble` skill，优先使用 bundled `sidekick.mjs`，MCP/tool discovery 作为 fallback。
- [x] 新增 fake CLI E2E 和真实模型 CLI smoke。
- [x] 运行完整验证。

## 当前状态

| 文件 | 变更描述 |
| --- | --- |
| `src/cli.ts` | 新增 `sidekick` CLI entrypoint 和参数解析 |
| `src/core/**` | 新增 setup/list/run/cleanup/common 领域模块 |
| `src/tools/sidekick.ts` | MCP tools 改为 core API 薄包装 |
| `package.json` / `package-lock.json` | 新增 `sidekick` bin、bundle/copy/CLI E2E/real smoke scripts、`esbuild` |
| `tests/**` | 新增 CLI/core/E2E/real smoke 测试，修 Windows fake CLI wrapper 和 temp cleanup |
| `C:\Users\hrz\.agents\skills\ensemble\SKILL.md` | 更新为优先调用 `bin/sidekick.mjs` |
| `C:\Users\hrz\.agents\skills\ensemble\bin\sidekick.mjs` | 最新 bundle，大小约 82.8 KB |
| `tasks/lessons.md` / `tasks/todo.md` | 记录 MCP-vs-CLI 教训和本次 review/results |

已运行并通过：

- `npm run lint`
- `npm test`（15 files / 121 tests）
- `npm run build`
- `npm run test:sidekick:e2e`（`SIDEKICK_COMMAND_E2E_OK`）
- `npm run test:e2e`（`SIDEKICK_E2E_OK`）
- `npm run test:sidekick:e2e:real`（`SIDEKICK_REAL_COMMAND_SMOKE_OK agent=claude model=sonnet`）
- `npm run copy:ensemble-sidekick`
- `git diff --check`（只有 CRLF normalization warnings）

## 下一个 Agent 的待办事项

1. 如需提交，检查 diff 后按仓库要求在 commit message 中引用 “Claude, Codex, and Gemini”。
2. 如果要继续增强，可以给 `sidekick` CLI 增加机器可读 `--version` / `help --json`，但当前需求已完成。
3. 若要测试 Codex real smoke，先修本机 WindowsApps Codex 权限问题；当前 `codex` / `codex.exe` 直接启动都会报 `Access is denied`。

## 关键决策记录

| 决策 | 原因 |
| --- | --- |
| CLI public name 使用 `sidekick`，bundle 使用 `sidekick.mjs` | 用户明确要求 CLI 调用直接叫 `sidekick`，随 skill 分发 `sidekick.mjs` |
| core 拆成 `src/core/setup.ts`、`agents.ts`、`run.ts`、`cleanup.ts`、`common.ts` | 避免一个宽泛 core 文件重新变成杂糅模块；测试已守住领域边界 |
| CLI 路径移除 `dotenv/config` | ESM single-file bundle 中 `dotenv` CommonJS dynamic require 会触发运行时错误；CLI 仍读取真实环境变量 `SIDEKICK_*` |
| 保留 MCP fallback | `ensemble` skill 应优先用 bundled CLI，但仍能在 CLI 缺失/未配置时使用已有 MCP peer tools |
| 默认 real CLI smoke 使用 Claude sonnet | 本机 Codex 可执行当前被 WindowsApps 权限阻塞；Claude real smoke 成功证明真实模型路径可用 |

## 阻塞项

- Codex real CLI smoke 被本机外部环境阻塞：`codex` / `codex.exe` 位于 WindowsApps，直接启动返回 `Access is denied`。这不是 Sidekick CLI 的模型返回错误，需先修本机 Codex 安装/权限。

## 建议下一步

下一步优先做一次人工 diff review，确认 `src/core/` 模块边界和 `ensemble` skill 文案符合预期，然后提交。
