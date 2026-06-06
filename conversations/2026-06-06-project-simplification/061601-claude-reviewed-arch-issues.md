# 交接记录 — 061601 · claude · reviewed-arch-issues

## 继承的上下文

本轮接续 `conversations/2026-06-06-project-simplification/061548-codex-refactored-task-worktrees.md`。前序已完成：

- 删除 HTTP/service/daemon，保留纯 stdio MCP server。
- Runner 拆分为 `BaseRunner` + 4 个 concrete class，parser/renderer 归入各自 runner。
- Task 域新增 `TaskRunCoordinator`，worktree 域拆分为 `create/cleanup/git/naming/types` 5 文件 + `manager.ts` facade。

用户本轮要求：**审查架构和风格问题**，明确指出两处：worktrees 过度抽象、cliDetector 仍硬编码 runner 名称；并写交接文档。

## 本次完成的工作

- [x] 完整阅读 `src/` 下所有文件，识别架构与风格问题。
- [x] 写出本交接文档，记录问题分析和修复建议。
- [ ] 修复代码（本轮仅做 review，不改代码）。

## 当前状态

代码未变动，仅完成架构 review。以下是识别出的所有问题：

---

### 问题 1 — `cliDetector.ts` 硬编码 runner 名称（高优先级）

**文件**: `src/utils/cliDetector.ts`

**现象**：

```typescript
export interface CliAvailability {
  gemini: boolean; codex: boolean; claude: boolean; opencode: boolean;
}
export async function detectAvailableClis(...): Promise<CliAvailability> {
  const [gemini, codex, claude, opencode] = await Promise.all([
    commandExists(CLI.COMMANDS.GEMINI, ...),
    commandExists(CLI.COMMANDS.CODEX, ...),
    commandExists(CLI.COMMANDS.CLAUDE, ...),
    commandExists(CLI.COMMANDS.OPENCODE, ...),
  ]);
  return { gemini, codex, claude, opencode };
}
```

**问题**：新增一个 runner 需要同时修改 `CliAvailability` 类型和 `detectAvailableClis` 函数体。Runner 本身已知道自己的默认命令名（`AgentConfig.command` 默认为 runner 名）；检测逻辑没有利用这一点。

**修复方向**：
- 让 `AgentRunner` interface 增加一个 `defaultCommand: string` 属性（或直接复用 runner `name`）。
- `detectAvailableClis` 改为接受 runner adapters 数组，返回 `Record<RunnerName, boolean>`，在内部 `Promise.all` 时遍历数组而非逐一命名。
- `CliAvailability` 改为 `type CliAvailability = Record<RunnerName, boolean>`（或 `Partial<...>`）。
- `constants.ts` 中 `CLI.COMMANDS.*` 只由 `cliDetector.ts` 使用，修复后可删除整个 `CLI` 常量块。

---

### 问题 2 — `worktrees/create.ts` 硬编码 runner 名称（高优先级）

**文件**: `src/worktrees/create.ts`，第 18 行

**现象**：

```typescript
if (request.agent === 'claude' || request.agent === 'gemini') {
  return { id: name, kind: 'native', cwd: request.baseCwd, name };
}
```

**问题**：native worktree（runner 自己管理 `--worktree` flag）和 managed worktree（Sidekick 创建物理 git worktree）的判断条件被硬编码在 worktree 域。新增一个支持 `--worktree` 的 runner 需要修改 `create.ts`，违背了"新增 runner 只改 runner 文件"的设计目标。

**修复方向**：
- 在 `AgentRunner` interface 增加 `readonly worktreeSupport: 'native' | 'managed'`（或 `readonly usesNativeWorktree: boolean`）。
- `ClaudeRunner` 和 `GeminiRunner` 设为 `'native'`，`CodexRunner` 和 `OpenCodeRunner` 设为 `'managed'`。
- `WorktreeRequest` 增加 `runner: AgentRunner`（或把 `agent: RunnerName` 替换为完整 runner 对象），`create.ts` 改为 `if (runner.worktreeSupport === 'native')`。
- 另一个更轻量的做法：`WorktreeRequest` 增加 `useNativeWorktree: boolean`，由 `TaskRunCoordinator` 在调用前查 runner registry 填入。这样 worktrees 域不需要依赖 runner 域。

---

### 问题 3 — Worktrees 过度分拆（中优先级）

**现象**：`src/worktrees/` 有 6 个文件，但实际逻辑体量很小：

| 文件 | 实际代码行数 |
| ---- | ------------ |
| `git.ts` | ~10 行（1 个函数） |
| `naming.ts` | ~16 行（2 个函数） |
| `create.ts` | ~54 行 |
| `cleanup.ts` | ~60 行 |
| `types.ts` | ~29 行 |
| `manager.ts` | ~3 行（纯 re-export barrel） |

`git.ts` 和 `naming.ts` 太小，各自只有 1-2 个函数。`manager.ts` 只做 re-export，加了一层 indirection 但没有隐藏任何实现复杂度。

**修复方向**：
- 将 `git.ts` 和 `naming.ts` 合并入 `create.ts`（它们只被 `create.ts` 和 `cleanup.ts` 使用）；或
- 将所有内容合并为单一 `worktrees/index.ts`（整个域逻辑约 130 行，不需要多文件）；
- 删除 `manager.ts` 这个空 barrel，让外部直接从 `worktrees/index.ts` import。
- 保留 `types.ts` 是合理的，因为它被 runner domain 和 task domain 共享。

---

### 问题 4 — `buildRecommendedConfig` 硬编码 runner 名称（低优先级）

**文件**: `src/tools/sidekick.ts`，`buildRecommendedConfig` 函数

**现象**：

```typescript
const byRunner = Object.fromEntries(discovery.map(...));
const gemini = byRunner.gemini;
const claude = byRunner.claude;
const codex = byRunner.codex;
const opencode = byRunner.opencode;
```

**问题**：这个函数是 setup UX 逻辑，不是运行时路径，但仍然逐一点名了四个 runner，新增 runner 需要在此处补充分支。相比前两个问题，优先级较低，因为这里的"硬编码"是有意为之的 UX 差异化（不同 runner 的 config template 不同）。

**修复方向（可选）**：将每个 runner 的推荐 config 模板移入 runner class 自身（新增 `defaultAgentConfigTemplate()` 方法），setup 函数遍历 adapters 调用即可。这样加一个新 runner 只改 runner 文件。

---

### 问题 5 — `constants.ts` 中 `CLI.COMMANDS` 已无必要（低优先级）

**文件**: `src/constants.ts`

在修复问题 1（cliDetector 去硬编码）后，`CLI.COMMANDS.GEMINI/CODEX/CLAUDE/OPENCODE` 将不再被使用。届时应删除整个 `CLI` 常量块，只保留 `PROTOCOL` 常量和 `ToolArguments` 类型。

---

## 下一个 Agent 的待办事项

1. **修复问题 1（`cliDetector.ts`）**：
   - 将 `CliAvailability` 改为 `Record<RunnerName, boolean>`。
   - `detectAvailableClis` 接收 runner adapters（`AgentRunner[]`），遍历 `adapter.name` 做 PATH 检测。
   - 更新所有 callers（`serverApp.ts`、`tools/sidekick.ts`）使用新 API。
   - 修复后删除 `constants.ts` 中的 `CLI.COMMANDS`。
   - 更新相关测试（`tests/config.test.ts` 或 cliDetector 测试）。

2. **修复问题 2（`worktrees/create.ts`）**：
   - 在 `AgentRunner` interface（`src/runners/types.ts`）增加 `readonly worktreeSupport: 'native' | 'managed'`。
   - `ClaudeRunner`、`GeminiRunner` 设为 `'native'`；`CodexRunner`、`OpenCodeRunner` 设为 `'managed'`。
   - `WorktreeRequest`（`src/worktrees/types.ts`）增加 `useNativeWorktree: boolean` 字段（或直接传 runner 对象）。
   - `TaskRunCoordinator`（`src/tasks/runCoordinator.ts`）在调用 `createWorktree` 前查 runner registry 决定 `useNativeWorktree`。
   - `create.ts` 改为用该字段判断，删除硬编码 runner 名称。
   - 确保测试覆盖新增 property 和 `create.ts` 判断分支。

3. **可选：整合 worktrees 目录（问题 3）**：
   - 将 `git.ts` + `naming.ts` 合入 `create.ts`，删除两个只有 1-2 函数的文件。
   - 或整体合并为 `worktrees/index.ts`（推荐，因为整个域实现约 130 行）。
   - 删除空 barrel `manager.ts`，直接导出。
   - 更新所有 import 路径。

4. 每次改动后运行 `npm run lint && npm test && npm run build && npm run test:e2e`。
5. Commit 必须包含 "Claude, Codex, and Gemini" authorship reference。

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| 本轮只 review 不改代码 | 用户要求"写 handoff 文档"，且改动涉及 runner interface contract、worktree domain API、多处 callers；打包成一次修复更容易验证 |
| 问题 1 和问题 2 为高优先级 | 它们直接违背了"新增 runner 只改 runner 文件"的设计目标，前序 simplification 已经建立这个目标 |
| 问题 3（worktree 分拆）为中优先级 | 正确性没有问题，只影响导航体验；改后 diff 较大，可单独 commit |
| 问题 4（`buildRecommendedConfig`）为低优先级 | 是 setup UX 路径，不是运行时路径；重构收益不如前两个问题明显 |

## 阻塞项

- 无。所有问题都有明确修复方向，不需要用户决策。

## 建议下一步

下一个 Agent 应从**问题 1（`cliDetector.ts` 去硬编码）**入手，与**问题 5（删除 `CLI.COMMANDS`）**一起完成，然后再做问题 2（`worktrees/create.ts` runner-driven worktree type）。两个修改都有对应测试可以验证正确性。
