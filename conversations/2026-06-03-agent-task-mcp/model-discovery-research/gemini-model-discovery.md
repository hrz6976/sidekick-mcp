# Gemini CLI 模型发现调研

日期：2026-06-04  
仓库：`/fast/hrz/multicli`  
本机 Gemini CLI：`gemini --version` -> `0.45.0`  
源码：`/fast/hrz/tmp-sources/google-gemini-cli`，`git rev-parse HEAD` -> `4196596f7f48c0c397776f0cb7862c88d8fae91e`

## 结论

Gemini CLI 目前没有适合 Sidekick 默认调用的 headless/json `list models` 命令。本机 `gemini --help` 只列出 `mcp`、`extensions`、`skills`、`hooks`、`gemma` 和默认交互入口；`gemini models --help`、`gemini list --help` 都退回同一份 top-level help，没有模型枚举子命令。`--output-format json|stream-json` 是非交互 prompt 执行输出格式，不是模型目录输出格式。

Sidekick 不应把 Gemini CLI 源码里的静态模型集合或 fallback/routing 状态标成“账号当前可用模型”。对 Gemini，`setup` / `list_agents` 最稳妥的语义是返回：

- `configuredModel`：Sidekick config 中显式设置的 `agents.<alias>.model`。
- `configuredCandidates`：Sidekick config 中显式设置的 `agents.<alias>.models`。
- `cliDefault`：未配置 model 时使用 Gemini CLI 自己的默认，当前文档为 `auto`。
- `knownCliCandidates`：仅作为候选/提示，来源标注为 Gemini CLI bundled docs/source 或 Sidekick fallback，不能叫 available。
- `liveApiModels`：只有在用户显式要求并提供 Gemini API key/后端语义时，才可调用 Google AI API `models.list`，并明确标注这是 Gemini API catalog，不等于 Gemini CLI 当前 OAuth/Code Assist/Vertex/local Gemma 路径的可用集。

## 1. 是否有 headless/json 的 list models 命令

没有发现。

本机 `gemini --help` 显示 Gemini CLI 默认进入 interactive mode，`-p/--prompt` 才是 non-interactive headless mode。列出的命令只有：

- `gemini mcp`
- `gemini extensions <command>`
- `gemini skills <command>`
- `gemini hooks <command>`
- `gemini gemma`
- `gemini [query..]`

模型相关只出现了全局 `-m, --model` 选项。`-o, --output-format` 的取值是 `text|json|stream-json`，但描述为 CLI 非交互输出格式。实测 `gemini models --help` 和 `gemini list --help` 没有进入模型子命令，而是输出 top-level help。

源码层面也没有发现 `models.list` 被包装为 CLI 子命令。模型 UI 是 slash command：

- `packages/cli/src/ui/commands/modelCommand.ts` 定义 `/model manage` 和 `/model set <model-name> [--persist]`。
- `packages/cli/src/ui/components/ModelDialog.tsx` 构建交互式选择 UI。
- `packages/cli/src/acp/acpUtils.ts` 会为 ACP mode 生成 `availableModels`，但来源仍是 `ModelConfigService.getAvailableModelOptions()` 或硬编码 fallback；这不是通用 CLI headless/json 命令。

官方 Gemini CLI model docs 也只说明 `/model` 会打开 dialog，并说明可以用 `--model` 在启动时指定模型；没有列出 headless/json list command。  
来源：https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/model.md

## 2. `/model`、`--model`、`GEMINI_MODEL`、`settings.json` 的语义

### `/model`

`/model` 是 interactive slash command。

- `/model` 或 `/model manage`：打开模型配置 dialog。
- `/model set <model-name> [--persist]`：设置当前模型；带 `--persist` 时通过 config 的 `onModelChange` 写回持久配置。
- Dialog 中也有 “Remember model for future sessions” 开关；关闭时只是当前会话临时选择。

官方文档说明 `/model` 用于配置 Gemini CLI 使用的模型，推荐 `Auto`，也可以手动选择特定模型。文档特别说明 `/model` 和 `--model` 不覆盖 sub-agents 使用的模型。  
来源：https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/model.md

### `--model`

`--model` 是启动参数，指定本次 CLI session 使用的模型字符串。源码中 `packages/cli/src/config/config.ts` 的解析逻辑是：

```ts
const rawModel =
  argv.model || process.env['GEMINI_MODEL'] || settings.model?.name;
```

它优先级最高，但不是持久化设置。模型字符串可以是 CLI alias（如 `auto`、`pro`、`flash`、`flash-lite`）或具体模型 id。最终解析可能被 model routing / fallback 影响。

### `GEMINI_MODEL`

`GEMINI_MODEL` 是环境变量默认模型。官方配置文档说它指定默认 Gemini model，覆盖 hardcoded default。源码优先级显示它低于 `--model`，高于 `settings.model.name`。

### `settings.json`

Gemini CLI 有多层 JSON 配置：

- system defaults
- user settings：`~/.gemini/settings.json`
- project settings：`.gemini/settings.json`
- system settings overrides
- environment variables
- command-line arguments

官方配置文档给出的总体优先级是命令行参数最高、环境变量次之，settings 文件低于它们。model routing 文档给出的模型选择优先级是：

1. `--model`
2. `GEMINI_MODEL`
3. `model.name` in `settings.json`
4. local model router
5. default model `auto`

来源：

- https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md
- https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/model-routing.md

## 3. 源码符号是否能当作账号当前可用模型

不能直接当作“账号当前可用模型”。

### `VALID_GEMINI_MODELS`

位置：`packages/core/src/config/models.ts`

这是随 CLI 发版的静态 Set，包含 Gemini/Gemma 相关常量，例如 preview、default、flash、flash-lite、Gemma 等。它用于本地模型识别、quota/fallback UI、能力判断等逻辑，不是通过当前账号远程枚举得到的列表。

它也不是完整 catalog：Google AI API docs 的模型页包含大量 Gemini、media、embedding、audio、tool/agent 模型；CLI 的 `VALID_GEMINI_MODELS` 只覆盖 Gemini CLI 需要关心的一小组聊天/路由模型。

### `ModelConfigService.getAvailableModelOptions`

位置：`packages/core/src/services/modelConfigService.ts`

该方法从 `this.config.modelDefinitions` 里筛选：

- `isVisible === true`
- preview 模型按 `context.hasAccessToPreview` 过滤
- Pro 模型按 `context.hasAccessToProModel` 过滤
- alias 和 concrete model 按 `modelIdResolutions` 解析

默认 `modelDefinitions` 来自 `packages/core/src/config/defaultModelConfigs.ts`，用户还可以通过 `settings.modelConfigs` 扩展/覆盖。因此它返回的是“CLI dialog/ACP 应展示的候选项”，不是远程账号 catalog。

它有一些 account-ish 过滤：例如 quota buckets/experiments 能影响 preview/pro 是否展示。但这只是对 bundled/configured options 的过滤，不证明返回项一定可生成，也不列出账号所有可生成模型。

### `ModelAvailabilityService`

位置：`packages/core/src/availability/modelAvailabilityService.ts`

这是当前 session 内的健康状态 map：

- `markTerminal(modelId, 'quota'|'capacity')`
- `markRetryOncePerTurn(modelId, attempts)`
- `snapshot(modelId)`
- `selectFirstAvailable(modelIds)`
- `resetTurn()` / `reset()`

默认未知模型返回 `{ available: true }`。也就是说它只记录“本会话里某模型刚刚因为 quota/capacity/retry 被标记为不可用”，不是主动探测账号可用模型，更不能独立作为 account availability。

### quota / experiment access

`Config.refreshUserQuota()` 会通过 Code Assist server `retrieveUserQuota()` 获取 quota buckets，并据此记录 `lastRetrievedQuota`、每个 bucket 的 remaining fraction、以及 `hasAccessToPreviewModel`。`getProModelNoAccess()` 使用实验 flag 判断某些 auth type 下是否没有 Pro access。

这能解释 Gemini CLI dialog 为什么会按 preview/pro 做展示过滤，但它仍不是通用 `list models`：

- 只在特定 auth/backend 路径下有意义。
- 不是公开 CLI 命令。
- 不覆盖 Gemini API key、Vertex、local Gemma、custom `settings.modelConfigs` 的完整交集。
- quota bucket 出现与否不能等同于“所有当前可用模型列表”。

## 4. Sidekick 是否应该调用 Google AI API `models.list`

默认不应该。

Google AI API 的 `models.list` 官方语义是列出 Gemini API 可用的 `Model` 资源，并返回支持功能、上下文窗口等 metadata。官方 REST endpoint 是：

```text
GET https://generativelanguage.googleapis.com/v1beta/models
```

官方示例会遍历 `client.models.list()` 并按 `supported_actions` 过滤 `generateContent` / `embedContent`。  
来源：https://ai.google.dev/api/models#v1beta.models.list

但 Gemini CLI 的可用性语义不等于 Gemini API `models.list`：

- Gemini CLI 可使用 Google login / Code Assist、Gemini API key、Vertex AI、gateway、本地 Gemma 路由等多种路径。
- `models.list` 需要 Gemini API 后端凭据；本机环境当前 `GEMINI_API_KEY` 和 `GOOGLE_API_KEY` 都未设置。
- `models.list` 返回 API catalog，不知道 Gemini CLI 的 `auto`/`pro`/`flash` alias、`modelConfigs`、preview/pro experiment flags、Google One/Code Assist quota bucket、fallback policy、sub-agent model config。
- 在 `setup` 自动调用它会引入网络、认证、延迟和误导性：用户可能以 OAuth 使用 Gemini CLI，但没有 API key；或者 API catalog 有某模型，CLI 当前账号/套餐仍不可用。

推荐策略：

- 默认只返回 configured/default/candidates，清楚标注来源。
- 不要把 Gemini fallback list 命名为 `availableModels`。
- 如果未来要支持 live discovery，设计成显式 opt-in，例如 `setup({ liveGeminiApiModels: true })` 或单独工具，并要求用户确认使用 Gemini API key/项目；结果字段命名为 `geminiApiModels`，不是 `geminiCliAvailableModels`。
- 可过滤 `supported_actions` 包含 `generateContent`，但仍只代表 Gemini API catalog。
- 真正验证某个 Gemini CLI model 是否能跑，只能做小 prompt smoke test，例如 `gemini --model <id> -p ...`；这会消耗 quota，应显式请求后才做。

## 5. Sidekick setup 最佳语义

Gemini runner 的 setup/list_agents 应遵循“描述来源，而不是夸大可用性”：

### 字段建议

对每个 agent 返回：

```json
{
  "runner": "gemini",
  "installed": true,
  "configuredModel": "auto",
  "configuredCandidates": ["auto", "gemini-2.5-pro"],
  "cliDefault": "auto",
  "candidateModels": [
    { "id": "auto", "source": "gemini-cli-default", "confidence": "default" },
    { "id": "pro", "source": "gemini-cli-alias", "confidence": "candidate" },
    { "id": "flash", "source": "gemini-cli-alias", "confidence": "candidate" },
    { "id": "gemini-2.5-pro", "source": "gemini-cli-docs/source", "confidence": "candidate" }
  ],
  "liveDiscovery": {
    "supported": false,
    "reason": "Gemini CLI has no headless/json list models command"
  }
}
```

如果沿用简单数组，至少改文案：

- `availableModels` -> `modelHints` 或 `candidateModels`
- `modelDiscovery` -> `modelSource`
- Gemini/Claude/Codex fallback models -> `staticCandidates`
- OpenCode `opencode models` -> `configuredProviderModels`，仍避免说全账号可用

### 推荐默认配置

Gemini 的 starter config 最好不要硬填易过期 preview 模型。优先级建议：

1. 如果用户已有 Sidekick config model，保留。
2. 如果用户显式给了 `agents.gemini.models`，从中选。
3. 否则 Gemini agent 可以省略 `model`，让 Gemini CLI 使用自身默认 `auto`。
4. 如果必须写一个值，写 `auto`，而不是 `gemini-3.1-pro` 这类可能不是真实 model id 的字符串。

当前 Sidekick fallback 中的 `gemini: ['gemini-3.1-pro', 'gemini-3-flash']` 风险较高。Gemini CLI 源码/文档中的 preview id 是带 `-preview` 的，例如 `gemini-3.1-pro-preview`、`gemini-3-flash-preview`；此前 handoff 也记录过 `gemini-3.1-pro` 触发 `ModelNotFoundError`。因此 setup 不应自动推荐这些字符串作为“可用模型”。

### setup 文案建议

`setup` 应明确告诉调用方 agent：

- Gemini CLI 没有安全的 headless model-list command。
- 对 Gemini，Sidekick 展示的是配置值、CLI default 和静态候选，不是账号当前可用模型。
- `--model`/Sidekick `model` 覆盖本次 Gemini CLI session；不配置则走 Gemini CLI 自己的 `auto`。
- `/model` 是交互式维护入口；如用户想持久切换 Gemini CLI 默认模型，可在 Gemini CLI 中使用 `/model` 或修改 `~/.gemini/settings.json` / project `.gemini/settings.json` 的 `model.name`。
- 只有用户明确要求验证模型时，才运行真实 Gemini prompt smoke test。

## 证据清单

本机命令：

- `gemini --version` -> `0.45.0`
- `gemini --help` -> 无 `models` / `list models` 命令；有 `--model`、`--prompt`、`--output-format`
- `gemini models --help` -> 输出 top-level help
- `gemini list --help` -> 输出 top-level help
- `GEMINI_API_KEY` / `GOOGLE_API_KEY` 当前均未设置

本地源码：

- `/fast/hrz/tmp-sources/google-gemini-cli/packages/cli/src/config/config.ts`
- `/fast/hrz/tmp-sources/google-gemini-cli/packages/cli/src/ui/commands/modelCommand.ts`
- `/fast/hrz/tmp-sources/google-gemini-cli/packages/cli/src/ui/components/ModelDialog.tsx`
- `/fast/hrz/tmp-sources/google-gemini-cli/packages/cli/src/acp/acpUtils.ts`
- `/fast/hrz/tmp-sources/google-gemini-cli/packages/core/src/config/models.ts`
- `/fast/hrz/tmp-sources/google-gemini-cli/packages/core/src/config/defaultModelConfigs.ts`
- `/fast/hrz/tmp-sources/google-gemini-cli/packages/core/src/services/modelConfigService.ts`
- `/fast/hrz/tmp-sources/google-gemini-cli/packages/core/src/availability/modelAvailabilityService.ts`
- `/fast/hrz/tmp-sources/google-gemini-cli/packages/core/src/config/config.ts`

官方文档：

- Gemini CLI model selection: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/model.md
- Gemini CLI model routing: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/model-routing.md
- Gemini CLI configuration: https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md
- Google AI API models.list: https://ai.google.dev/api/models#v1beta.models.list
- Gemini API model guide: https://ai.google.dev/gemini-api/docs/models
