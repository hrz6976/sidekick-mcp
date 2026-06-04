# 交接记录 — 041033 · codex · verified-four-agents

## 继承的上下文

继承本 thread 中 Sidekick MCP 重构与 correction pass 的记录。用户继续追问两个关键点：

1. 是否真的清除了所有死代码。
2. 是否真的对 Codex、Gemini、Claude、OpenCode 都做了 E2E 测试。

上一次记录里只明确通过了真实 Codex smoke；这不足以支撑“四个 agent 全部真实 E2E 已验证”的说法。

## 本次完成的工作

- [x] 使用 explorer subagent 做只读交叉审计，确认此前 fake E2E 只覆盖 Claude/Codex，真实 smoke 脚本是可参数化但没有自动枚举四个 agent。
- [x] 扩展 `tests/e2e-sidekick.mjs`：现在用 built `dist/index.js` 和 fake CLI 顺序调用 Claude、Gemini、Codex、OpenCode 四个 agent。
- [x] 在 fake E2E 中验证：
  - `sidekick_setup` setup-only mode。
  - configured mode 的三工具注册。
  - `sidekick_start_task` 为 `taskSupport: "required"`。
  - `sidekick_list_models` 返回四个配置模型。
  - Claude/Gemini 走 native worktree 记录。
  - Codex/OpenCode 走 Sidekick managed git worktree，并通过 `sidekick_cleanup_worktree` 删除。
- [x] 新增 package script `npm run test:e2e:real:all`，一次 build 后顺序跑四个真实 CLI/model smoke：
  - `claude sonnet`
  - `gemini` CLI default model
  - `codex` CLI default model
  - `opencode` CLI default model
- [x] 删除 stale `tests/INSTRUCTIONS.md`，该文件仍描述旧 `{cli-name}-ask` / `{cli-name}-list-models` 工具面。
- [x] 更新 `tests/TESTS.md`，描述当前 Sidekick 验证方式。
- [x] 收窄 `knip` 报出的内部 helper 导出：
  - `src/config.ts`
  - `src/runners/registry.ts`
  - `src/service/bootstrap.ts`
  - `src/service/runtime.ts`
- [x] 在 `tasks/lessons.md` 记录经验：不能把“脚本可参数化”说成“四个 agent 都跑过”。
- [x] 更新 `tasks/todo.md`，记录当前四 agent E2E 与 dead-code 审计结果。

## 当前状态

| 文件 | 变更描述 |
| ---- | -------- |
| `tests/e2e-sidekick.mjs` | built-server fake E2E 覆盖 Claude/Gemini/Codex/OpenCode 四个 agent |
| `package.json` | 新增 `test:e2e:real:all` |
| `tests/INSTRUCTIONS.md` | 删除 stale 死文档 |
| `tests/TESTS.md` | 更新为当前 Sidekick verification suite |
| `src/config.ts` | 收窄内部类型/helper 导出 |
| `src/runners/registry.ts` | `RUNNERS` 改为内部常量 |
| `src/service/bootstrap.ts` | `runServiceBootstrap` 改为内部函数 |
| `src/service/runtime.ts` | runtime path helper 改为内部函数 |
| `tasks/lessons.md` | 添加四 agent E2E 覆盖经验 |
| `tasks/todo.md` | 添加本轮审计和验证结果 |

## 验证结果

已通过：

- `npx --yes knip`
- 旧命名/旧工具扫描：无 `SIDEKICK_MCP`、`sidekick_mcp`、`~/.sidekick-mcp`、`MultiCli`、`Multi-CLI`、`@osanoai`、`multicli`、旧 Ask-* tool 名称残留（排除历史 conversations / node_modules / dist）。
- `npm run lint`
- 串行最终验证：
  - `npm test`：12 files / 96 tests
  - `npm run test:e2e`：`SIDEKICK_E2E_OK`
  - `npm run test:e2e:real:all`：
    - `SIDEKICK_REAL_MODEL_SMOKE_OK agent=claude model=sonnet`
    - `SIDEKICK_REAL_MODEL_SMOKE_OK agent=gemini model=`
    - `SIDEKICK_REAL_MODEL_SMOKE_OK agent=codex model=`
    - `SIDEKICK_REAL_MODEL_SMOKE_OK agent=opencode model=`
  - `npm run build`

## 下一个 Agent 的待办事项

1. 若继续清理，可评估是否需要把 `test:e2e:real:all` 写入文档的 release checklist，但不要加入 CI，真实模型 smoke 会消耗登录账号额度。
2. 如果用户要求提交/PR，按仓库 authorship 要求在 commit/PR 中提到 Claude, Codex, and Gemini。

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| CI 只跑 fake E2E，不跑 real all | 真实 smoke 消耗本机登录 CLI/model 额度，CI 环境通常没有四个 CLI 凭据 |
| `src/service/bootstrap.ts` 保留 | 它是 service launcher 调用的编译入口，不一定出现在普通 import 图中 |
| 删除 `tests/INSTRUCTIONS.md` | 文件描述旧工具面，属于 stale 死文档 |

## 阻塞项

- 无。

## 建议下一步

一句话：如果用户还要更严格的发布前门禁，优先把 `npm run test:e2e:real:all` 作为人工 release checklist，而不是 CI 必跑项。
