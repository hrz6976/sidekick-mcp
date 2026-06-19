# 交接记录 — 191605 · gpt · complete-antigravity

## 继承的上下文

读取了 `conversations/260606-sidekick-cli-ensemble/` 的相关交接记录。本线程此前完成了 standalone `sidekick` CLI、bundle、ensemble skill 集成、trajectory export、release workflow、symlink entrypoint 修复和 progress label 改善。当前用户指出 Google 已弃用旧 Gemini CLI，并要求支持新的 Antigravity CLI。

## 本次完成的工作

- [x] 调研 Google Antigravity CLI 官方下载页、GitHub README/changelog，并下载 1.0.10 binary 查看 `--help`。
- [x] 新增 `src/runners/antigravity.ts`，实现 `runner: "antigravity"`，默认命令 `agy`。
- [x] 将 `antigravity` 纳入 `RUNNER_NAMES`、runner registry、CLI detection、setup/list guidance 和 README。
- [x] 保留 legacy `runner: "gemini"`，避免破坏现有配置。
- [x] 更新 unit / integration / fake E2E 测试，并复制最新 standalone bundle 到 ensemble skill。

## 当前状态

| 文件 | 变更描述 |
| ---- | -------- |
| `src/runners/antigravity.ts` | 新增 Antigravity runner：`agy --print <prompt>`、`--model`、`agy models`、plain stdout answer/progress。 |
| `src/config.ts` | runner 枚举增加 `antigravity`；默认命令 map 让 Antigravity 使用 `agy`。 |
| `src/runners/registry.ts` | 注册 `antigravityRunner`。 |
| `src/core/agents.ts` / `src/core/setup.ts` | 更新 setup/list guidance，说明 Antigravity、`agy models`、权限 flag 和 managed worktree。 |
| `README.md` / `package.json` | 文档和 metadata 增加 Google Antigravity CLI 支持说明。 |
| `tests/**` | 覆盖 Antigravity args、permission override、model discovery、config default command、CLI detection、setup discovery、bundle fake run。 |
| `~/.agents/skills/ensemble/bin/sidekick.mjs` | 已复制最新 bundle。 |
| `tasks/todo.md` | 记录计划、完成项和验证结果。 |

验证已通过：

- `npm test -- tests/runners.test.ts`
- `npm run lint`
- `npm test`（16 files / 132 tests）
- `npm run test:sidekick:e2e`（`SIDEKICK_COMMAND_E2E_OK`）
- `npm run test:mcp:e2e`（`SIDEKICK_E2E_OK`）
- `npm run copy:ensemble-sidekick`
- `git diff --check`

## 下一个 Agent 的待办事项

1. 如需发布，检查 diff 后按仓库要求提交，commit message 必须引用 “Claude, Codex, and Gemini”。
2. 如果后续 Google 给 `agy --print` 增加结构化输出，可以增强 Antigravity progress / trajectory fidelity；当前只能可靠处理 plain stdout。
3. 如果要做真实 smoke，需本机先安装并登录 `agy`，再给 `tests/real-sidekick-command-smoke.mjs` 增加或手动执行 Antigravity 路径。

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| 新增 `runner: "antigravity"`，不替换 `runner: "gemini"` | 现有用户配置不应被破坏；新 Google CLI 和旧 Gemini CLI 的 flag/输出不同。 |
| 默认命令使用 `agy` | 官方 installer 将 binary 安装为 `agy`，下载页/README 均以 Antigravity CLI 为新入口。 |
| 使用 Sidekick-managed worktree | `agy --help` 未显示 native `--worktree` flag；Sidekick 可通过 cwd 管理隔离。 |
| `read-only` 映射 `--sandbox`，`full-access` 映射 `--dangerously-skip-permissions` | 这是 Antigravity CLI 暴露的权限控制面；若用户在 `extraArgs` 已显式设置权限 flag，则不再叠加默认值。 |
| 不为 Antigravity 添加 effort 映射 | `agy --help` 未暴露 headless reasoning-effort flag；和 legacy Gemini 一样拒绝 Sidekick `effort`。 |

## 阻塞项

- 无本地阻塞。未运行真实 `agy` smoke，因为本机没有已安装/已登录的 `agy`；本次使用官方 1.0.10 binary `--help` 和 fake E2E 验证命令形状。

## 建议下一步

下一位 Agent 接手后应先查看 `git status --short`，然后决定是否提交当前 Antigravity runner 变更。
