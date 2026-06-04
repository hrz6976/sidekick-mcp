# 交接记录 — 032040 · codex · refactored-sidekick

## 继承的上下文

已读取本 thread 下两个既有记录：

- `conversations/2026-06-03-agent-task-mcp/032013-codex-researched-agent-mcp.md`
- `conversations/2026-06-03-agent-task-mcp/032029-codex-drafted-goal-mode.md`

锁定决策保持不变：项目改名 Sidekick，npm 包为 `@hrz6976/sidekick-mcp`，binary 为 `sidekick-mcp`；旧 `Ask-*` 工具面不保留；配置缺失时只暴露 `sidekick_setup`；配置存在时暴露 task-first 的 `sidekick_start_task`、`sidekick_list_models`、`sidekick_cleanup_worktree`。

## 本次完成的工作

- [x] 创建 `tasks/todo.md` 并记录阶段 checklist。
- [x] 基线运行 `npm run lint`，发现依赖未安装导致 `tsc: not found`。
- [x] 执行 `npm install`，同步 package metadata 并安装 TypeScript/Vitest。
- [x] 将 `package.json` 改为 Sidekick 包名、binary 和描述。
- [x] 重写 `src/config.ts`：默认 `~/.sidekick-mcp/config.json`，支持 `SIDEKICK_MCP_CONFIG_PATH`，不读取 `MULTICLI_*`。
- [x] 新增 runner registry、task metadata store、worktree manager 和 Sidekick tools。
- [x] 改 `src/tools/index.ts` 只注册 Sidekick 工具。
- [x] 改 `src/serverApp.ts` 使用 Sidekick server identity，移除旧 client tool filtering，强制 `taskSupport: required` 的工具必须走 MCP Tasks。
- [x] `npm run lint` 已通过。
- [ ] `npm test` 仍失败：主要是旧 Multi-CLI contract tests 未改写。

## 当前状态

| 文件 | 变更描述 |
| ---- | -------- |
| `package.json` / `package-lock.json` | 包名改为 `@hrz6976/sidekick-mcp`，binary 改为 `sidekick-mcp`，安装依赖后 lock 同步 |
| `src/config.ts` | 新 Sidekick JSON config loader 和运行时路径 |
| `src/runners/*` | 新 runner 类型和命令构造 |
| `src/tasks/metadataStore.ts` | 轻量任务 metadata/log/result 落盘 |
| `src/worktrees/manager.ts` | managed/native worktree 创建与 cleanup 初版 |
| `src/tools/sidekick.ts` | 四个 Sidekick 工具的实现 |
| `src/tools/index.ts` / `src/tools/registry.ts` | 注册新工具面，支持显式 annotations |
| `src/serverApp.ts` / `src/index.ts` / `src/httpServer.ts` | server/logger 身份改 Sidekick，任务执行保持原 MCP Tasks plumbing |
| `tasks/todo.md` | 阶段 checklist 与基线结果 |

验证：

- `npm run lint`：通过。
- `npm test`：失败，32 个失败集中在旧 config/service/tools/server/http 测试仍断言 Multi-CLI 行为；其余 286 个通过。

## 下一个 Agent 的待办事项

1. 改写测试：`tests/config.test.ts`、`tests/tools/initTools.test.ts`、`tests/serverApp.test.ts`、必要时 `tests/httpServer.test.ts` 和 service 测试，断言 Sidekick 新 contract。
2. 补 worktree cleanup by `worktreeId`：当前 cleanup 主要按 `taskId` 查 metadata，`worktreeId` 单独查找还未实现。
3. 更新 README/CHANGELOG，删除旧 Multi-CLI usage。
4. 运行 `npm run lint`、`npm test`、`npm run build`。

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| 保留现有 MCP Tasks plumbing | 已有 progress/cancel/task store 基础可用，避免引入后台 worker/daemon |
| 工具注册由 config mode 决定，不再由 CLI availability 决定 | 配置存在时目标工具应稳定可见；可用性放到 `sidekick_list_models` 返回 |
| 旧内部 type alias 暂时保留 `MultiCliConfig = SidekickConfig` | 降低一次性改动面，用户可见身份已经改 Sidekick |

## 阻塞项

- 无。当前主要剩余是测试和文档改写。

## 建议下一步

一句话：先把测试改到新 Sidekick contract，再修 `worktreeId` cleanup 和文档。
