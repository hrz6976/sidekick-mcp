# 交接记录 — 061452 · codex · continue-simplification

## 继承的上下文

本次用户先要求帮助发布 npm 新版本，但随后明确中止发布方向，改为精简项目：

- 问题 1：用户不需要后台运行的 service，所有 daemon 相关内容可以删除。
- 问题 2：当前 Claude、Gemini、Codex、OpenCode 的适配耦合较高，希望抽象成更方便新增 coding agent 的形式；实现方式由 agent 选择，以简洁为准。

已按 handoff 规则创建新的任务线程目录：`conversations/2026-06-06-project-simplification/`。

已用 `$grill-me` 只问了一个必须由用户拍板的问题：daemon 删除边界。用户确认选择：

> 删除 service + HTTP transport，全项目只保留 stdio。

这意味着不要保留 foreground `serve-http` 模式；应删除 service、HTTP server、HTTP transport 配置、依赖、测试和文档入口。

## 本次完成的工作

- [x] 暂停 npm 发布任务，未继续 commit/push。
- [x] 检查当前 worktree 状态，确认已有未提交改动来自前一轮 Claude review resolution，应保留并继续基于它工作。
- [x] 阅读了 `tasks/lessons.md`、`tasks/todo.md`、`package.json`、`.github/workflows/release.yml`、`src/config.ts`、`src/index.ts`、`src/runners/*`、`src/serverApp.ts` 的相关内容。
- [x] 初步定位 daemon/service/HTTP 相关文件和配置。
- [x] 初步定位 runner 耦合点：`src/runners/registry.ts`、`src/runners/output.ts`、`src/runners/progress.ts`、`src/tools/sidekick.ts`。
- [x] 在 `tasks/todo.md` 追加 `Project Simplification` 计划，并补充用户确认：删除 service + HTTP transport，只保留 stdio。
- [ ] 尚未修改源码实现。

## 当前状态

当前尚未进入实现阶段，只做了计划和交接记录。worktree 中有上一轮 review resolution 的未提交改动，后续不要回滚：

| 文件 | 变更描述 |
| ---- | -------- |
| `README.md` | 已有未提交改动：补充/修正 `effort` override 文档 |
| `src/tools/sidekick.ts` | 已有未提交改动：effort 校验、OpenCode 推荐、`list_agents` fallback 等 |
| `tests/runners.test.ts` | 已有未提交改动：Claude effort 示例改为有效值 |
| `tests/serverApp.test.ts` | 已有未提交改动：review findings 回归测试 |
| `tasks/todo.md` | 已有未提交改动：review resolution、npm release 暂停记录、project simplification 计划 |
| `conversations/2026-06-05-code-review/` | 未跟踪目录：上一轮 review/resolution 交接记录 |
| `conversations/2026-06-06-project-simplification/061452-codex-continue-simplification.md` | 本交接记录 |

已知 daemon/HTTP/service 面：

- `src/httpServer.ts`
- `src/service/bootstrap.ts`
- `src/service/manager.ts`
- `src/service/paths.ts`
- `src/service/renderers.ts`
- `src/service/runtime.ts`
- `src/service/types.ts`
- `tests/httpServer.test.ts`
- `tests/service.test.ts`
- `src/index.ts` 中 `serve-http` / `service` command 分支
- `src/config.ts` 中 `transport: 'stdio' | 'http'`、HTTP env/config fields、service paths
- `package.json` 中 HTTP/service 相关 dependencies 很可能包括 `@hono/node-server`、`express`、`express-rate-limit`、`cors`
- README / AGENTS 中提到 loopback HTTP service / transport 的内容

已知 runner 耦合点：

- `src/config.ts` 用硬编码 `RunnerName = 'claude' | 'gemini' | 'codex' | 'opencode'` 和 `RUNNER_NAMES` 验证 config。
- `src/runners/registry.ts` 同时包含 model fallback、模型发现、命令参数构造、effort flag 映射、四个 runner object。
- `src/runners/output.ts` 用 `switch (runner)` 调用四套 output extractor。
- `src/runners/progress.ts` 用 `switch (runner)` 调用四套 progress renderer。
- `src/tools/sidekick.ts` 还有 `RUNNER_NAMES`、effort validation、model discovery description、recommended config 逻辑和 OpenCode 特殊推荐逻辑。

## 下一个 Agent 的待办事项

1. 先运行 `git status --short --branch`，确认上述未提交改动仍在；不要回滚用户/前序 agent 的未提交改动。
2. 从 daemon 删除开始，做干净切除：
   - 删除 `src/httpServer.ts` 和 `src/service/**`。
   - 在 `src/index.ts` 删除 `serve-http`、`service` command，默认且唯一启动 stdio。
   - 在 `src/config.ts` 删除 `SidekickTransport`、HTTP fields、service fields、相关 env parsing helpers；`SidekickConfig` 只保留 stdio 需要的字段。
   - 删除 `tests/httpServer.test.ts`、`tests/service.test.ts`，并更新 `tests/config.test.ts`、`tests/serverApp.test.ts` 中 HTTP/service fixture 字段。
   - 移除 `package.json` 中只为 HTTP/service 使用的 dependencies，并同步 `package-lock.json`。
   - 更新 README、AGENTS、CHANGELOG，去掉 daemon/service/HTTP 说法。
3. 再做 runner adapter 重构，推荐组合式而非继承：
   - 新增一个 adapter 类型，例如 `RunnerAdapter`，集中包含 `name`、`fallbackModels`、`listModels`、`buildArgs`、`extractOutput`、`createProgressRenderer`、`validateEffort`、`modelDiscoveryDescription`、可选 `recommendAgents`。
   - 每个 runner 一个独立文件或清晰分区：Claude、Gemini、Codex、OpenCode。
   - `registry.ts` 只负责注册/查找 adapter，并导出 `RUNNER_NAMES`、`getRunner` / `getRunnerAdapters`。
   - `output.ts` 和 `progress.ts` 尽量变成通用工具 + adapter 方法，减少中央 `switch`。
   - `sidekick.ts` 用 adapter lookup 替代本地 `RUNNER_NAMES`、`validateReasoningEffort`、`modelDiscoveryDescription` 等 switch/常量。
   - 保持现有 config JSON 的 `runner` 字段兼容，仍支持 `claude`、`gemini`、`codex`、`opencode`。
4. 更新测试：
   - 删除 HTTP/service tests 后保证测试数变化合理。
   - 保留并调整上一轮新增的 review regression tests。
   - 增加至少一个 adapter 注册/扩展相关测试，证明新增 runner 的改动面更集中（可测试 registry 暴露的 adapter capabilities）。
5. 完成后运行：
   - `npm run lint`
   - `npm test`
   - `npm run build`
   - `npm run test:e2e`
   - `git diff --check`
6. 在 `tasks/todo.md` 的 `Project Simplification` checklist 中勾选实际完成项，并追加 Review / Results。
7. 结束时写新的 handoff note 到 `conversations/2026-06-06-project-simplification/`。

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| 删除 service + HTTP transport，只保留 stdio | 用户明确确认；HTTP transport 主要服务于 daemon/service 形态，保留会继续维护 express/session/auth/origin/config/tests/docs，不符合精简目标 |
| runner 抽象优先组合式 adapter，不优先 class 继承 | 现有差异主要是小能力组合：命令参数、模型发现、输出解析、进度渲染、effort 校验；adapter object 比继承层级更直观，也方便新增 agent |
| 保留当前未提交 Claude review fixes | 这些改动已经有计划与交接记录，且与精简任务不冲突；项目规则禁止回滚非本任务改动 |
| 暂停 npm 发布 | 用户中断发布任务并切换目标；不要在新 session 中继续发布，除非用户重新要求 |

## 阻塞项

- 无。daemon 删除边界已经由用户确认。

## 建议下一步

一句话：新 goal session 接手后先从删除 `src/httpServer.ts` / `src/service/**` 和配置/测试引用开始，再进行 runner adapter 重构。
