# 交接记录 — 051047 · codex · complete-review

## 继承的上下文

读取了 `conversations/2026-06-05-code-review/051032-claude-reviewed-sidekick-mcp.md`。Claude 审查确认 6 个需要处理的 findings：

- C7：`ask_<agent>` 的 `effort` 接受任意字符串，可能把无效值传给 Claude，Gemini 则静默忽略。
- C3：`preferOpenCodeModel` 过早过滤 `opencode/` 前缀，导致只发现 `opencode/deepseek-chat` 时无法推荐 DeepSeek agent。
- C4：同一个同时匹配 DeepSeek/Kimi 正则的 OpenCode 模型可能被推荐成两个 agent。
- C10：`list_agents` 直接调用 runner `listModels`，没有经过 `safeListModels`。
- C8：`setupPrompt` 中 `configuredAgents` 保留了不必要的 `async`/`Promise.all`。
- C9：`buildRecommendedConfig` 中 `firstModel()` 重复调用。

同时读取了 `tasks/lessons.md`，相关约束是：公开 ask 工具参数应加在 ask-tool schema/执行路径上；模型列表语义必须清楚区分本地发现、配置值和不可验证候选。

## 本次完成的工作

- [x] 修复 C7：在 `createAskTool` 执行时按 runner 验证 public `effort` override。
- [x] 修复 C3：OpenCode DeepSeek/Kimi pattern 匹配时不再无条件排除 `opencode/...` 模型。
- [x] 修复 C4：DeepSeek 已选中的模型会从 Kimi 推荐匹配中排除。
- [x] 修复 C10：`list_agents` 改为使用 `safeListModels`。
- [x] 完成 C8/C9 cleanup：移除同步路径上的 `Promise.all`，缓存 `firstModel()` 结果。
- [x] 更新 README 和 setup prompt 的 effort 取值说明。
- [x] 增加回归测试覆盖 setup 推荐、effort 拒绝、list_agents fallback。
- [x] 完成验证。

## 当前状态

当前代码和测试均已修改并通过验证。尚未提交 commit。

| 文件 | 变更描述 |
| ---- | -------- |
| `src/tools/sidekick.ts` | 新增 runner-specific effort 校验；修复 OpenCode 推荐模型选择/去重；`list_agents` 改用 `safeListModels`；清理同步映射和重复 `firstModel()` 调用 |
| `tests/serverApp.test.ts` | 新增 C3/C4/C7/C10 回归测试；将有效 effort override 测试改为 `high` |
| `tests/runners.test.ts` | 将 runner 参数构造测试中的 Claude effort 示例从 `xhigh` 调整为有效值 `high` |
| `README.md` | 记录 Claude/Codex effort 合法值、OpenCode variant 规则、Gemini 拒绝 effort |
| `tasks/todo.md` | 追加本次 Claude Review Resolution 计划与结果 |
| `conversations/2026-06-05-code-review/051047-codex-complete-review.md` | 本交接记录 |

已运行命令：

- `npm test -- tests/serverApp.test.ts`
- `npm test -- tests/serverApp.test.ts tests/runners.test.ts`
- `npm run lint`
- `npm test`（14 files / 122 tests）
- `npm run build`
- `npm run test:e2e`（`SIDEKICK_E2E_OK`）
- `git diff --check`

## 下一个 Agent 的待办事项

1. 如需发布，先检查最终 diff，然后按项目要求创建 commit；commit/PR 文案必须包含 "Claude, Codex, and Gemini" authorship reference。
2. 若要进一步加严配置文件中的 `reasoningEffort`，需要单独设计兼容策略；本次只验证 public ask-tool `effort` override，避免突然拒绝已有用户配置。
3. 如用户要求，可运行 `npm run test:e2e:real:all` 做真实 CLI/model smoke；本次未运行真实 provider 测试。

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| 在 tool 执行阶段验证 `effort`，而不是只改共享 zod schema | 共享 `AskTaskSchema` 不知道具体 `ask_<agent>` 对应哪个 runner；执行阶段有 `agentConfig.runner`，能给出正确的 runner-specific 错误 |
| Gemini 对 public `effort` 直接报错 | Sidekick 没有 Gemini effort flag 映射，继续接受会造成静默忽略 |
| OpenCode 不做固定枚举，只限制 simple variant name | OpenCode `--variant` 可能是 provider-defined，固定枚举会过度收窄；简单名称校验足以拒绝明显无效值 |
| Pattern 匹配时允许 `opencode/...` | Claude C3 指出只有 `opencode/deepseek-chat` 时也应能推荐 DeepSeek agent；fallback 默认选择仍继续避开 `opencode/...` |
| 未验证配置文件里的 `reasoningEffort` | 本次 finding 指向 public `effort` 字段；配置兼容性更敏感，适合独立变更 |

## 阻塞项

- 无。

## 建议下一步

一句话：如果要交付到远端，先审阅 diff，然后按项目 authorship 规则提交并推送。
