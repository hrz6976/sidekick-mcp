# Claude Code 模型发现调研

日期：2026-06-04  
仓库：`/fast/hrz/multicli`  
本机 Claude Code：`2.1.162`

## 结论先行

1. 本机 `claude` CLI 没有发现公开的 headless/json 模型列表命令。`claude --help` / `claude --print --help` 只公开 `--model`，以及 `--output-format text|json|stream-json` 用于非交互执行结果；未公开 `models` / `list-models` 子命令。试探 `claude models --help`、`claude model --help`、`claude list-models --help` 只回到顶层 help；`claude --models` 报 unknown option。
2. Claude Code 源码里的 `/model`、`availableModels`、`validateModel`、`modelCapabilities` 不是同一种语义：
   - `/model` 是交互式 slash command 和设置入口；无参数打开 `ModelPicker`，带参数则设置当前模型。
   - `availableModels` 是企业/managed settings allowlist，用来限制用户可选择模型；未设置表示不限制，空数组阻止用户指定模型。
   - `validateModel` 是对一个候选模型做最小真实 API 调用验证；不是枚举模型。
   - `modelCapabilities` 通过 `anthropic.models.list` 拉取并缓存 `id/max_input_tokens/max_tokens`，主要给上下文窗口等能力判断使用，而且只在内部 Ant + first-party 条件下启用。
3. 这些都不能直接当作“当前账号可用 Claude Code 模型列表”。它们分别是 UI 候选项、管理员限制、单模型验证、能力缓存/API catalog，不是 Claude CLI 当前登录态的公开可枚举列表。
4. Anthropic 官方 API 有 `GET /v1/models` / SDK `anthropic.models.list()`。它适合 API key/workspace 语义下的模型发现；不等价于 Claude Code OAuth/订阅账号的 CLI 可用模型。最小真实调用可以验证某个候选模型是否可用，但会消耗额度/触发限制，应作为显式验证动作，不应在 Sidekick `setup` 默认执行。
5. Sidekick `setup` 最佳语义：对 Claude runner 只报告“CLI installed / configured model / candidate hints”，不要声称“live available models”。用户没有配置模型时，优先留空让 Claude CLI 用默认模型；配置时接受 `sonnet` / `opus` / `haiku` 等 Claude Code alias 或用户显式提供的模型。需要验证时，提供可选验证建议，而不是自动跑 API/真实模型调用。

## 本机 CLI 调研

已运行：

- `claude --version && claude --help`
- `claude --print --help`
- `claude models --help`
- `claude model --help`
- `claude list-models --help`
- `claude --models`

观察：

- `claude --help` 的公开命令包括 `agents`、`auth`、`auto-mode`、`doctor`、`install`、`mcp`、`plugin|plugins`、`project`、`setup-token`、`ultrareview`、`update|upgrade`，没有 `models` 或 `list-models`。
- `--model <model>` 的 help 语义是为当前 session 指定模型，可用 alias 如 `sonnet` / `opus` 或 full name。
- `--output-format json|stream-json` 只在 `--print` 非交互执行时输出结果，不是模型 catalog 输出。
- `claude --models` 明确报错：unknown option。

因此，对 Sidekick 来说，不存在可安全调用的 `claude models --json` 等公开接口。

## 源码语义拆解

### `/model`

位置：

- `/fast/hrz/tmp-sources/yasasbanukaofficial-claude-code/src/commands/model/model.tsx`

关键行为：

- `/model` 无参数时返回 `ModelPickerWrapper`，即打开交互式模型选择器。
- `/model --help` 风格参数只显示说明：“Run /model to open the model selection menu, or /model [modelName] to set the model.”
- `/model [modelName]` 先检查 `availableModels`，再检查 1M context 权限，别名直接接受，非别名通过 `validateModel` 做真实 API 校验。

源码证据：

- `SetModelAndClose` 对带参数模型执行 allowlist、1M、alias、validateModel 分支：`model.tsx:143-190`。
- `call` 无参数返回 `ModelPickerWrapper`，help 只输出用法：`model.tsx:271-291`。

语义结论：

`/model` 是交互式 UI/设置命令，不是 headless 列表 API。它的 picker 列表来自 `getModelOptions()`，而不是一次账号实时列举。

### `ModelPicker` / `getModelOptions`

位置：

- `/fast/hrz/tmp-sources/yasasbanukaofficial-claude-code/src/utils/model/modelOptions.ts`

关键行为：

- `getModelOptionsBase()` 按用户类型、订阅层级、API provider、1M context access 组装 picker 候选项。
- 列表里有硬编码的模型家族和版本逻辑，例如 subscriber、PAYG first-party、PAYG 3P 分支。
- `getModelOptions()` 还会加入：
  - `ANTHROPIC_CUSTOM_MODEL_OPTION`
  - bootstrap 缓存里的 `additionalModelOptionsCache`
  - 当前用户已经指定但不在基础列表中的 custom model
- 最后用 `availableModels` allowlist 过滤。

源码证据：

- 按 tier/provider 拼 picker 列表：`modelOptions.ts:269-376`。
- 追加 env custom model / bootstrap additional model options / 当前 custom model：`modelOptions.ts:461-523`。
- allowlist 过滤：`modelOptions.ts:527-540`。

语义结论：

这是“Claude Code 希望展示的模型选择项”，不是“账号当前所有可调用模型”。它可能包含默认/别名/自定义/缓存项，也可能被 managed settings 过滤。

### `availableModels` allowlist

位置：

- `/fast/hrz/tmp-sources/yasasbanukaofficial-claude-code/src/utils/settings/types.ts`
- `/fast/hrz/tmp-sources/yasasbanukaofficial-claude-code/src/utils/model/modelAllowlist.ts`

关键行为：

- settings schema 把 `availableModels` 描述为企业 allowlist，支持 family alias、version prefix、full model ID；未定义表示全部可选，空数组表示只有 default。
- `isModelAllowed()`：
  - 未设置 allowlist：返回 true。
  - 空数组：返回 false。
  - 支持 family alias、specific prefix、full ID、alias resolution。

源码证据：

- schema 描述：`types.ts:379-389`。
- allowlist 匹配规则：`modelAllowlist.ts:89-170`。

语义结论：

`availableModels` 是“限制用户选择”的策略，不是 discovery 结果。它只能说明“管理员允许选择哪些候选”，不能说明模型实际存在、账号可用、当前 provider 可用。

### `validateModel`

位置：

- `/fast/hrz/tmp-sources/yasasbanukaofficial-claude-code/src/utils/model/validateModel.ts`

关键行为：

- 对输入模型做 trim、空值检查。
- 先过 `availableModels` allowlist。
- 已知 alias 直接返回 valid。
- `ANTHROPIC_CUSTOM_MODEL_OPTION` 直接返回 valid。
- 命中本地 cache 直接 valid。
- 否则调用 `sideQuery`，`max_tokens: 1`，`maxRetries: 0`，消息内容为 `Hi`。
- 404 / not_found 判 invalid；认证/网络/API error 返回具体错误。

源码证据：

- 说明“Validates a model by attempting an actual API call”：`validateModel.ts:17-20`。
- 最小调用参数：`validateModel.ts:55-74`。
- 错误处理：`validateModel.ts:84-137`。

语义结论：

`validateModel` 是“候选模型能否被当前 API/provider 调用”的单点验证。它可靠性高于静态列表，但不是列表生成器；会产生真实 API 请求和额度/限流风险。

### `modelCapabilities` / `anthropic.models.list`

位置：

- `/fast/hrz/tmp-sources/yasasbanukaofficial-claude-code/src/utils/model/modelCapabilities.ts`

关键行为：

- 只缓存 `{ id, max_input_tokens?, max_tokens? }`，并 strip 其他字段。
- eligibility 很窄：
  - `USER_TYPE === 'ant'`
  - API provider 为 `firstParty`
  - base URL 是 first-party Anthropic
- 如果 essential traffic only，则跳过。
- 通过 `getAnthropicClient()` 后 `for await (const entry of anthropic.models.list({ betas }))` 拉取。
- 缓存文件是 Claude config home 下的 `cache/model-capabilities.json`。
- `getModelCapability()` 用 cached models 做 exact/substring match，供上下文窗口等能力逻辑使用。

源码证据：

- eligibility：`modelCapabilities.ts:46-50`。
- cache schema 只保留能力字段：`modelCapabilities.ts:18-34`。
- `anthropic.models.list` 调用和缓存写入：`modelCapabilities.ts:85-118`。
- context window 会读 `getModelCapability()`：`/fast/hrz/tmp-sources/yasasbanukaofficial-claude-code/src/utils/context.ts:51-83`。

语义结论：

这不是通用用户模型发现。它是内部 Ant/first-party 条件下的能力缓存，用于 model capability lookup。即使底层 API 返回模型 catalog，也没有被 Claude Code 当作普通用户的 `/model` 可用列表来源。

### SDK initialize response 里的 `models`

位置：

- `/fast/hrz/tmp-sources/yasasbanukaofficial-claude-code/src/entrypoints/sdk/controlSchemas.ts`
- `/fast/hrz/tmp-sources/yasasbanukaofficial-claude-code/src/cli/print.ts`

关键行为：

- SDK control initialize response schema 有 `models: ModelInfo[]`。
- `print.ts` 中 `modelInfos` 是由 `getModelOptions()` map 出来的。

语义结论：

这是 SDK 初始化协议的一部分，不是公开的 CLI 子命令；而且其数据源仍是 picker options，不是账号实时枚举。Sidekick 不应依赖这个内部协议做模型列表。

## 官方 Anthropic API 语义

官方文档确认：

- `GET /v1/models`
- 需要 `x-api-key` 和 `anthropic-version` header。
- response 包含 `data`，每项有 `id`、`display_name`、`created_at`、`type`，并支持分页。
- 文档写明 Models API response 可用于判断 API 中哪些模型可用，新模型排在前面。

来源：

- https://docs.claude.com/en/api/models-list
- https://anthropic.mintlify.app/en/api/models-list

本环境检查：

- `ANTHROPIC_API_KEY` 未设置。
- `ANTHROPIC_AUTH_TOKEN` 未设置。
- 因此本次没有执行 `GET /v1/models`，也没有执行真实 `messages` 调用。

关键边界：

- API key 是 workspace scoped；API models list 表示 Anthropic API workspace/key 的模型语义。
- Claude Code 可能使用 OAuth/Claude subscription、first-party API key、Bedrock、Vertex、Foundry 或 provider override。API `models.list` 不能自动代表 Claude Code CLI 当前登录态。
- 如果 Sidekick 只是 shell out 到 `claude` CLI，最接近真实的验证是让 `claude --print --model <candidate>` 做一次最小任务；但这会消耗 quota、可能触发 session/rate limits，并且比 setup discovery 慢。

## 能否作为“账号当前可用模型列表”

| 来源 | 能否作为当前账号可用列表 | 原因 |
| --- | --- | --- |
| `claude --help` | 否 | 只公开参数和命令，不列模型 |
| `/model` picker | 否 | 交互式候选项，tier/provider/config aware，但不是实时全量 catalog |
| `availableModels` | 否 | 管理员 allowlist/deny-by-omission 策略，不是发现 |
| `validateModel` | 否 | 单候选真实调用验证，不枚举 |
| `modelCapabilities` cache | 否 | 内部 Ant/first-party 能力缓存，字段也不是 picker 信息 |
| Anthropic `models.list` | API 场景下部分可以，Claude CLI 场景下不能直接等同 | 代表 API key/workspace 可用模型，不代表 Claude Code OAuth/订阅登录态 |
| 最小 Claude CLI 调用 | 可以验证单个候选是否可用 | 不是列表；有 quota/latency/limit 副作用 |

## Sidekick setup 最佳语义

建议把 Sidekick 的模型信息分成三类，不混名：

1. `configuredModels`：来自用户配置的 `model` / `models`。这是 Sidekick 能确定会传给 runner 的模型。
2. `candidateModels` 或 `modelHints`：Claude 可给 `['sonnet', 'opus', 'haiku']` 这类 alias hints；明确标注不是 live discovery。
3. `verifiedModels`：只有在用户显式要求验证、且 Sidekick 实际执行 API/CLI 最小调用成功后，才可使用这个标签。

对 Claude runner：

- `setup` / `list_agents` 不应称 `['sonnet', 'opus', 'haiku']` 为 `availableModels`。
- 如果用户没配置 Claude model，推荐不写 `model` 字段，让 Claude CLI 使用自己的 default。
- 如果要推荐，推荐 alias 而非 hard-coded dated model id：`sonnet`、`opus`、`haiku`。
- 如果用户问“这个模型当前能不能用”，提供显式验证动作：
  - API key 场景：`GET /v1/models` 或最小 `messages` 调用。
  - Claude CLI 场景：`claude --print --output-format json --model <model> "..."` 的最小真实调用。
- 默认 setup 不自动做真实调用；它应保持快速、低副作用、不会消耗额度。

对当前 Sidekick 实现的具体语义建议：

- `src/runners/registry.ts` 当前 Claude fallback 是 `['sonnet', 'opus', 'haiku']`。这应在文案中称为 fallback/candidate/model hints，而不是 “available models”。
- `src/tools/sidekick.ts` 当前 setup 文案对非-OpenCode 写的是 “configured model list or Sidekick fallback models”，方向正确；但 JSON 字段名 `availableModels` / `models` 容易让调用方误读。后续若改源码，建议重命名或增加 `modelDiscoveryKind`，例如：
  - `configuredModels`
  - `modelHints`
  - `modelDiscoveryKind: "configured" | "opencode-cli" | "fallback-hints" | "not-supported"`
- `list_agents` 的 guidance 应明确：Claude/Gemini/Codex fallback models are hints, not live account availability；OpenCode 是唯一当前通过 CLI 命令做模型发现的 runner，而且也只用 `opencode models`，不 refresh。

## 建议最终产品语义

Sidekick `setup` 应回答：“我检测到哪些 runner 安装了、哪些 helper 已配置、应该如何写配置、哪些模型是配置/提示/真实发现而来。”

Sidekick `setup` 不应回答：“这是你 Claude Code 账号当前可用的完整模型列表。”

如果用户需要强保证，Sidekick 应把它变成显式验证流程，而不是 setup 默认行为：

1. 先展示候选和来源。
2. 明确说明验证会调用外部 API/CLI，可能消耗额度。
3. 对每个用户选择的候选做最小真实调用。
4. 把成功结果标记为 verified，并记录验证时间、provider、命令/API 类型。

