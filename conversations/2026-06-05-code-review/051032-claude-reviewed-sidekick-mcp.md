# 交接记录 — 051032 · claude · reviewed-sidekick-mcp

## 继承的上下文

无。本次为全新代码审查线程，未读取之前的交接文件。
上一个活跃线程为 `conversations/2026-06-03-agent-task-mcp/`，内容是功能实现（effort 参数、setup UX 改进），与本次任务无关。

## 本次完成的工作

- [x] 对 `HEAD~5..HEAD` 的 diff 执行了多 Agent 多角度代码审查（7 个 finder 角度 × 4 个并行 Agent，再经 2 个 verifier Agent 确认）
- [x] 识别并去重了约 18 个候选问题，最终输出 6 个通过验证的 findings
- [x] 以 JSON + 表格双格式将结果呈现给用户

## 当前状态

代码审查已完成，所有 findings 已输出。**尚未对任何 finding 执行修复**。

| 文件 | 变更描述 |
| ---- | -------- |
| `src/tools/sidekick.ts` | 被审查的主文件，5 个 findings 指向此文件 |
| `src/runners/registry.ts` | 1 个 finding（已被标注为 REFUTED / 不影响正确性） |

## 发现的问题（按严重程度排序）

| ID | 文件:行 | 类型 | 摘要 |
|----|---------|------|------|
| C7 | `sidekick.ts:21` | **Bug** | `effort` 字段接受任意字符串，无效值传给 Claude CLI 会报错，Gemini 则静默忽略 |
| C3 | `sidekick.ts:150` | **Bug** | `preferOpenCodeModel` 对 deepseek/kimi 模式匹配时也过滤 `opencode/` 前缀，导致只有 `opencode/deepseek-chat` 的环境无法生成 deepseek agent |
| C4 | `sidekick.ts:150` | **Bug** | 同时匹配 deepseek 和 kimi 正则的模型（如 `deepseek/moonshot-v1`）会在推荐配置中生成两个指向同一模型的重复 agent 条目 |
| C10 | `sidekick.ts:500` | **脆弱性** | `list_agents` 直接调用 `getRunner().listModels()` 而不经过 `safeListModels` 包装，当前安全，但未来新增不含内部 try/catch 的 runner 时会崩溃 |
| C8 | `sidekick.ts:222` | **Cleanup** | `configuredAgents` 的 `async`/`Promise.all` 是遗留代码（移除 `safeListModels` 后函数体已全部同步） |
| C9 | `sidekick.ts:122` | **Cleanup** | `firstModel()` 在 gemini/claude/codex 三个 block 中各被调用两次（先判断再取值） |

## 下一个 Agent 的待办事项

1. **修复 C7**（`sidekick.ts:21`）：为 `AskTaskSchema` 的 `effort` 字段增加针对 runner 的枚举验证，或引入 `VALID_EFFORT_VALUES` 常量；至少拒绝明显无效值，避免无声失败
2. **修复 C3**（`sidekick.ts:150`）：重新评估 `preferOpenCodeModel` 的 `opencode/` 前缀过滤策略——仅在无 pattern（fallback 分支）时过滤，或保留带前缀的命名 provider 模型（deepseek/kimi）匹配
3. **修复 C4**（`sidekick.ts:150`）：在 `buildRecommendedConfig` 中对 deepseek/kimi 结果去重，避免同一模型被推荐为两个 agent
4. **修复 C10**（`sidekick.ts:500`）：将 `list_agents` 内的 `getRunner(agentConfig.runner).listModels(agentConfig, context)` 替换为 `safeListModels(agentConfig, context)`，保持与 `setupPrompt` 一致
5. **Cleanup C8**（`sidekick.ts:222`）：去掉 `configuredAgents` 的 `async` 关键字和 `await Promise.all` 包装，改为同步 `.map()`
6. **Cleanup C9**（`sidekick.ts:122`）：将三处 `firstModel(x.models) ? { model: firstModel(x.models) } : {}` 改为 `const m = firstModel(x.models); ...(m ? { model: m } : {})`
7. 修复后运行 `npm test` 并确认所有测试通过

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| C1（list_agents 崩溃路径）REFUTED | `configuredModels` 内部 try/catch 覆盖了 opencode/codex 所有 I/O 错误；claude/gemini 直接返回 FALLBACK_MODELS，无 I/O |
| C2（setupRequired 绕过）REFUTED | `readUserConfig` 在 `setupRequired:true` 时始终返回 `userConfig:undefined`，两者不可能同时成立 |
| C5（model 使用 agentConfig）REFUTED | `effectiveAgentConfig` 仅覆盖 `reasoningEffort`，`model` 字段两对象完全相同 |
| C6（runner 使用 agentConfig）REFUTED | 同上，`runner` 字段在 effort spread 后不变 |
| 审查范围 | HEAD~5..HEAD diff，主要变更为 effort 参数支持 + setup UX 改进 + modelHints 移除 |

## 阻塞项

- 无。所有 findings 均有明确修复方向，无需用户额外决策。

## 建议下一步

按 C7 → C3 → C4 → C10 顺序逐一修复（Bug 优先于 Cleanup），每次修复后运行 `npm test` 验证。
