# 交接记录 — 041407 · codex · updated-setup

## 继承的上下文

继承 `041402-codex-cleaned-results.md`：Sidekick 已经把 `ask_<agent>` 的最终结果清理成 `answer` + 元数据，raw stdout 只留在日志中。用户随后指出 `setup` 不应该只在首次安装时暴露，因为用户可能随时安装/卸载 CLI 或调整模型配置。

## 本次完成的工作

- [x] 将 `setup` 改为 configured mode 下也始终暴露。
- [x] setup 输出增加当前配置状态、已配置 agents、runner availability、模型 hints。
- [x] setup prompt 明确指导调用方 agent 创建或 patch `~/.sidekick/config.json`。
- [x] setup 生成 recommended starter config，优先使用已安装 runner 和发现/配置到的模型。
- [x] 更新 README、CHANGELOG、AGENTS、tests/TESTS 和相关测试。

## 当前状态

| 文件 | 变更描述 |
| ---- | -------- |
| `src/tools/sidekick.ts` | setup always-on；新增 lightweight runner/model discovery 与 recommended config |
| `tests/tools/initTools.test.ts` | configured mode 工具列表包含 `setup` |
| `tests/serverApp.test.ts` | 覆盖 configured 后 setup 仍可调用并返回 reconfiguration guidance |
| `tests/httpServer.test.ts` | HTTP 工具列表包含 `setup` |
| `tests/e2e-sidekick.mjs` | built-server E2E 覆盖 configured 后 setup prompt |
| `README.md` | 说明 setup 始终暴露、可用于重配置 |
| `CHANGELOG.md` | 更新 public tool surface 描述 |
| `AGENTS.md` | 更新架构说明 |
| `tests/TESTS.md` | 更新测试覆盖说明 |
| `tasks/todo.md` | 记录本轮 review/results |

## 验证结果

- `npm test -- tests/tools/initTools.test.ts tests/serverApp.test.ts`
- `npm run lint`
- `npm test`：14 files / 112 tests
- `npm run build`
- `npm run test:e2e`
- `git diff --check`

## 下一个 Agent 的待办事项

1. 如果要增强模型发现，优先补真实 CLI 文档/源码确认，避免为 Claude/Codex/Gemini 添加会阻塞或刷新远端状态的命令。
2. 如果继续解决 OpenCode timeout，基于当前 clean setup/result surface 设计普通 MCP job API。
3. 发布前如需真实 provider 验证，再跑 `npm run test:e2e:real:all`。

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| `setup` 始终暴露 | 用户可能随时重配模型、安装/卸载 CLI；setup 是维护入口，不只是首次安装入口 |
| setup 不直接写配置 | MCP tool 保持 read-only；实际修改由调用方 agent 在用户上下文中明确执行 |
| 模型发现保持轻量 | 避免 setup 变慢或触发远端刷新/认证副作用 |
| OpenCode 只用 `opencode models` | 延续既有约束：不要自动调用 `opencode models --refresh` |

## 阻塞项

- 无。

## 建议下一步

一句话：如果继续增强 setup，先为各 CLI 的“安全列模型命令”做实证调研，再扩大 discovery，而不是直接在 setup 里跑未知重命令。
