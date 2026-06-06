# 交接记录 — 070126 · gpt · complete-v012

## 继承的上下文

本线程完成了 standalone `sidekick` CLI、ensemble skill bundle、stderr progress、human stdout answer-only、删除无用 `title`、experimental ATIF trajectory export，以及最终的 runner-domain `trajectory` 命名。用户随后要求更新 README、打 `v0.1.2` tag、commit and push；中途又修正了两个 API 设计点：`trajectory` 应为单字段 `boolean | string`，MCP ask tools 也应暴露 optional debug-only `trajectory`；最后指出 config 里的 `reasoningEffort` 和其他地方的 `effort` 不一致。

## 本次完成的工作

- [x] README 增加 standalone `sidekick` CLI 文档、human/json 输出语义、无默认超时、experimental trajectory export、MCP debug-only `trajectory` 说明。
- [x] package metadata 从 `0.1.1` bump 到 `0.1.2`。
- [x] 将 public request shape 统一为 `trajectory?: boolean | string`，不再暴露拆分的 `trajectoryPath` 字段。
- [x] MCP `ask_<agent>` schema 增加 optional `trajectory`，描述明确为 experimental debug-only。
- [x] 将 config public 字段统一为 `effort`；旧 `reasoningEffort` 只作为 legacy config alias 读取。
- [x] 更新 tests 覆盖 CLI parsing、core trajectory 路径解析、MCP debug trajectory、legacy `reasoningEffort` alias、runner effort mapping。
- [x] 重新生成并复制 `dist/sidekick.mjs` 到 ensemble skill bin。
- [x] commit 并 push main；创建并 push `v0.1.2` tag。

## 当前状态

| 文件 | 变更描述 |
| --- | --- |
| `README.md` | 新增 standalone CLI 和 trajectory/MCP debug 文档，更新 config `effort`。 |
| `package.json` / `package-lock.json` | 版本为 `0.1.2`，新增 `sidekick` bin/scripts/esbuild。 |
| `src/cli.ts` | standalone `sidekick` entrypoint；`trajectory?: boolean | string` parsing。 |
| `src/core/**` | MCP-free setup/list/run/cleanup primitives。 |
| `src/tools/sidekick.ts` | MCP tools 复用 core；ask schema 暴露 `effort` 和 debug-only `trajectory`。 |
| `src/config.ts` | `AgentConfig.effort` 为当前字段；legacy `reasoningEffort` 兼容读入。 |
| `src/runners/trajectory.ts` | runner-domain ATIF v1.7 trajectory 类型、builder、writer。 |
| `src/runners/{claude,codex,gemini,opencode}.ts` | 各 runner 自己实现 trajectory step extraction 和 effort args。 |
| `tests/**` | 新增/更新 CLI、core、trajectory、MCP、real smoke、source-boundary 测试。 |

验证已通过：

- `npm test -- tests/cli.test.ts tests/core.test.ts tests/tools/initTools.test.ts tests/serverApp.test.ts`
- `npm test -- tests/config.test.ts tests/runners.test.ts tests/cli.test.ts tests/core.test.ts tests/tools/initTools.test.ts tests/serverApp.test.ts`
- `npm run lint`
- `npm test`（16 files / 128 tests）
- `npm run build`
- `npm run test:sidekick:e2e`（`SIDEKICK_COMMAND_E2E_OK`）
- `npm run test:mcp:e2e`（`SIDEKICK_E2E_OK`）
- `npm run copy:ensemble-sidekick`（串行重跑通过；并行跑时曾因 E2E build 清理 `dist` 产生竞态）
- `git diff --check` 仅有 CRLF normalization warnings

发布状态：

- Commit: `b328815` before final handoff amend; after amend, use `git log --oneline -1 --decorate` 查看最新 hash。
- Tag: `v0.1.2` should point at HEAD.
- Remote: `origin/main` and `origin/v0.1.2` pushed.

## 下一个 Agent 的待办事项

1. 检查 GitHub Actions release/publish run 是否成功发布 `@hrz6976/sidekick-mcp@0.1.2`。
2. 如 npm publish 失败，优先看 provenance / trusted publishing / tag 触发路径，不要盲目 bump patch。
3. 如果继续增强 trajectory fidelity，再比较 Harbor 对各 runner 原生 session 文件的转换逻辑；当前 Sidekick 只做 stdout JSONL best-effort。

## 关键决策记录

| 决策 | 原因 |
| --- | --- |
| Config 新字段使用 `effort` | 避免 config、CLI、MCP、result 对同一概念使用两个名字。 |
| Legacy `reasoningEffort` 继续读入 | 避免已有 `~/.sidekick/config.json` 立刻失效。 |
| `trajectory?: boolean | string` | 单字段 union 比 flag/path 拆分更容易解析和暴露到 MCP。 |
| MCP `trajectory` 标为 debug-only | trajectory 是实验性调试输出，普通 helper ask 不应默认使用。 |

## 阻塞项

- 无本地阻塞。发布是否完成取决于 GitHub Actions / npm trusted publishing。

## 建议下一步

下一位 Agent 接手后先检查 GitHub Actions 和 npm package 页面，确认 `v0.1.2` 是否已成功发布。
