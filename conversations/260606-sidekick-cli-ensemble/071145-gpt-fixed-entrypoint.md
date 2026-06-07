# 交接记录 — 071145 · gpt · fixed-entrypoint

## 继承的上下文

读取了 `conversations/260606-sidekick-cli-ensemble/` 下全部交接记录。此前已完成 standalone `sidekick` CLI、bundle、ensemble skill copy、trajectory export、v0.1.2 发布等工作。当前用户指出一个 CLI 入口 bug：`import.meta.url` 会解析到真实文件路径，而 `process.argv[1]` 保留 symlink 路径，导致入口 guard 不匹配，`main()` 静默不运行。

## 本次完成的工作

- [x] 确认当前 worktree 已有一个预先存在的 `package-lock.json` 修改，只包含 `bin.sidekick` 条目；本次未触碰该文件。
- [x] 修改 `src/cli.ts`，让入口判断对 `import.meta.url` 和 `process.argv[1]` 两侧都先做 `realpathSync`，失败时回退到 `path.resolve`。
- [x] 新增 `isDirectCliEntrypoint()` 并用单元测试覆盖 symlink 路径。
- [x] 更新 `tests/e2e-sidekick-command.mjs`，实际通过 symlink 启动 `dist/sidekick.mjs` 并验证 `sidekick list --json` 会执行。
- [x] 更新 `tasks/todo.md` 的本次 review/results。

## 当前状态

| 文件 | 变更描述 |
| --- | --- |
| `src/cli.ts` | CLI direct-entry guard 改为 realpath-aware，修复 symlink 启动静默退出。 |
| `tests/cli.test.ts` | 增加 symlink direct-entry 单元回归。 |
| `tests/e2e-sidekick-command.mjs` | 增加 bundle 通过 symlink 启动的 E2E 回归。 |
| `tasks/todo.md` | 记录本次计划、验证结果和已知 copy race。 |
| `~/.agents/skills/ensemble/bin/sidekick.mjs` | 已通过 `npm run copy:ensemble-sidekick` 串行重建并复制。 |

验证已通过：

- `npm test -- tests/cli.test.ts`
- `npm run lint`
- `npm test`（16 files / 129 tests）
- `npm run test:sidekick:e2e`（`SIDEKICK_COMMAND_E2E_OK`）
- `npm run test:mcp:e2e`（`SIDEKICK_E2E_OK`）
- `npm run copy:ensemble-sidekick`（第一次与 MCP E2E 并行运行时命中已知 `dist/` 清理竞态，串行重跑通过）
- `git diff --check`

## 下一个 Agent 的待办事项

1. 提交前再次查看 `git status --short`，注意 `package-lock.json` 是本次开始前已有的未提交修改，不要误当成本次修复产物。
2. 若要提交，commit message 按仓库要求引用 “Claude, Codex, and Gemini”。
3. 如需发布 patch，不要手动 bump patch version；release workflow 会处理 patch bump PR。

## 关键决策记录

| 决策 | 原因 |
| --- | --- |
| 两侧都使用 `realpathSync` 后比较 | Node 启动 symlink entrypoint 时 `import.meta.url` 指向真实文件，`argv[1]` 可保留 symlink；只 `path.resolve` 无法消除差异。 |
| realpath 失败回退到 `path.resolve` | 保留异常启动场景下的兼容性，避免入口判断因为无法 stat 某路径而抛错。 |
| 同时加 unit 和 E2E | unit 锁住 helper 行为，E2E 证明 bundle 通过 symlink 启动时 `main()` 真会运行。 |

## 阻塞项

- 无。

## 建议下一步

下一位 Agent 接手后应先确认是否需要把本次修复连同已有 `package-lock.json` 修改一起提交；若只提交本次修复，需要小心分开 staged 范围。
