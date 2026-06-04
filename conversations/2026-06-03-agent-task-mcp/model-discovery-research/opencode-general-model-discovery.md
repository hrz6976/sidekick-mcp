# OpenCode / Sidekick 通用模型发现调研

日期：2026-06-04  
范围：本机 OpenCode 1.3.17、`anomalyco/opencode` upstream、当前 Sidekick `src/tools/sidekick.ts` / `src/runners/registry.ts`。未修改源代码。

## 结论摘要

1. `anomalyco/opencode` 有 `opencode models [provider]` 命令；本机 `opencode --help`、`opencode models --help` 和 upstream `packages/opencode/src/cli/cmd/models.ts` 都确认存在。
2. `opencode models` 的语义应标为“OpenCode 当前 Provider 服务暴露的模型”，实际接近 configured/authenticated/auto-loaded provider set；它不是 models.dev 全量 catalog，也不是已通过一次真实 API 调用验证的 usable list。
3. Sidekick 不应该再返回裸 `string[] models` 并称为 available；应返回带 `source`、`confidence`、`cost`、`network`、`quotaRisk`、`validation` 的结构化发现结果。
4. `setup` 和 `list_agents` 都应该支持 `refresh` / `validate`，但默认值必须是 `false`：默认轻量、低风险；`refresh` 明确触网；`validate` 明确可能消耗额度。
5. UX 文案要把“configured / discovered / candidate / validated”分开，避免把静态 fallback 或 provider catalog 误导成“当前账号可用模型”。

## 1. OpenCode 是否有 models 命令

有。

本机 OpenCode 1.3.17：

```text
opencode models [provider]   list all available models
```

`opencode models --help` 显示：

```text
opencode models [provider]
provider    provider ID to filter models by
--verbose   use more verbose model output (includes metadata like costs)
--refresh   refresh the models cache from models.dev
```

Upstream `anomalyco/opencode`（本次 clone 到 `/fast/hrz/tmp-sources/anomalyco-opencode`，HEAD `70bb710`，2026-06-04）中，`packages/opencode/src/cli/cmd/models.ts` 定义：

- command: `models [provider]`
- `--verbose`
- `--refresh`
- handler 中先在 `args.refresh` 时执行 `ModelsDev.Service.refresh(true)`，随后执行 `Provider.Service.list()` 并打印 `providerID/modelID`。

线上文档也有对应 CLI 页：`https://www.mintlify.com/anomalyco/opencode/cli/models`，该页说明 `models` 用于列出 configured providers 的模型，`--verbose` 包含 pricing/context/capabilities，`--refresh` 刷新 models.dev cache。

## 2. `opencode models` 输出语义

推荐 Sidekick 内部语义：

```text
source.kind = "opencode_provider_list"
availability = "selectable_by_opencode"
confidence = "medium"
validated = false
```

原因如下。

### 不是全量 provider catalog

实证：

- 本机 `opencode providers list` 只显示 DeepSeek 和 OpenCode Go 两个 credentials。
- 本机 `opencode models` 输出包括 `opencode/*`、`opencode-go/*`、`deepseek/*`、`volcengine-plan/*`。
- 本机 `opencode models anthropic` 返回 `Provider not found: anthropic`，说明它没有把 models.dev 中所有 provider/model 全量打印出来。

源码：

- `ModelsCommand` 不直接遍历 `ModelsDev.Service.get()` 的全量 catalog；它调用 `Provider.Service.list()`。
- `Provider.Service` 先从 models.dev 建 database，再按 env/auth/config/plugin/custom autoload 合并到 `providers` map，最后过滤 disabled/deprecated/alpha/whitelist/blacklist。
- 因此 `opencode models` 打印的是 `providers` map，不是完整 `catalog`。

### 也不是严格的“已验证可调用”

`opencode models` 不执行一次 prompt 或 provider API validation。它只说明 OpenCode 当前 Provider 层认为该 provider/model 可显示、可选择。它可能仍因以下原因失败：

- API key 无效、额度耗尽、区域/plan 不支持。
- provider side 临时下线或限流。
- model 需要特定 account entitlement。
- custom provider 配置了模型元数据但实际 endpoint 不接受该 model id。

所以它比静态 fallback 更强，但低于 `validate: true` 的真实调用验证。

### `--verbose` 的价值

`opencode models --verbose` 在本机输出每个 model 的 JSON metadata，包括：

- `providerID`
- `name` / `family` / `status`
- `cost.input` / `cost.output` / cache cost
- `limit.context` / `limit.output`
- `capabilities.reasoning` / `toolcall` / modalities
- `variants`

这非常适合 Sidekick 填充 cost/capability 字段，但需要解析“模型行 + 下一段 JSON”的非 JSONL 结构；不建议第一版直接塞进 `list_agents` 默认路径，避免慢和脆弱。

## 3. 四类 runner 的统一 schema

当前 Sidekick 行为：

- `src/runners/registry.ts`：Claude/Gemini/Codex 若没有 `config.models`，返回硬编码 fallback；OpenCode 调 `opencode models`。
- `src/tools/sidekick.ts`：`setup` 中把 discovery 简化成 `models: string[]`，`list_agents` 也返回 `models`，容易误导。

建议 schema：

```ts
type DiscoverySourceKind =
  | "config_explicit"          // Sidekick config 的 agent.model / agent.models
  | "cli_provider_list"        // 例如 opencode models
  | "cli_cached_catalog"       // 例如 opencode models --verbose / models.dev cache metadata
  | "api_catalog"              // provider 官方 list models API
  | "bundled_catalog"          // CLI/doc/source 内置候选
  | "sidekick_fallback"        // Sidekick 自带默认候选
  | "validation_probe";        // validate 发起的真实探测

type DiscoveryConfidence =
  | "validated"        // 真实调用或官方 API 明确当前账号可用
  | "configured"       // 用户显式配置，未验证
  | "provider_listed"  // CLI/provider 当前列出，未验证调用
  | "catalog"          // catalog 有此 model，但未必当前可用
  | "candidate";       // fallback/文档候选

type NetworkUse = "none" | "local_cache" | "may_fetch_catalog" | "required";
type QuotaRisk = "none" | "none_expected" | "low" | "medium" | "high";

interface DiscoveredModel {
  id: string;                    // runner 使用的最终模型 id；OpenCode 为 provider/model
  runner: "opencode" | "codex" | "gemini" | "claude";
  provider?: string;
  displayName?: string;
  status: "configured" | "discovered" | "candidate" | "validated" | "failed";
  source: {
    kind: DiscoverySourceKind;
    command?: string[];
    path?: string;
    url?: string;
    refreshed?: boolean;
    observedAt: string;
  };
  confidence: DiscoveryConfidence;
  cost?: {
    inputPerMTok?: number;
    outputPerMTok?: number;
    cacheReadPerMTok?: number;
    cacheWritePerMTok?: number;
    source: "provider_metadata" | "models_dev" | "user_config" | "unknown";
    currency?: "USD";
  };
  capability?: {
    contextTokens?: number;
    outputTokens?: number;
    reasoning?: boolean;
    toolCalls?: boolean;
    attachments?: boolean;
  };
  network: {
    discovery: NetworkUse;
    validation: NetworkUse;
  };
  quotaRisk: {
    discovery: QuotaRisk;
    validation: QuotaRisk;
  };
  validation?: {
    checked: boolean;
    ok?: boolean;
    method?: "dry_run" | "minimal_prompt" | "models_api";
    error?: string;
    checkedAt?: string;
  };
  notes?: string[];
}

interface RunnerDiscovery {
  runner: "opencode" | "codex" | "gemini" | "claude";
  installed: boolean;
  command: string;
  discoveryStatus: "not_installed" | "ok" | "partial" | "failed";
  models: DiscoveredModel[];
  warnings: string[];
}
```

### Runner-by-runner 映射

| Runner | 默认发现源 | confidence | cost | network | quota risk | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| OpenCode | `opencode models` | `provider_listed` | 默认 unknown；`--verbose` 可得 metadata | 普通命令可能读 cache，也可能后台刷新；`refresh` 必定触网 | discovery 通常 none_expected；validate low/medium | 最强的本地 CLI model discovery；但不是 full catalog，也不是 validation |
| Codex | Sidekick config + fallback candidates | `configured` 或 `candidate` | unknown | none | none | 本机 `codex --help` / `codex exec --help` 未发现 list models 命令；模型有效性应靠配置或 validation |
| Gemini | Sidekick config + fallback candidates | `configured` 或 `candidate` | unknown | none | none | 本机 `gemini --help` 未发现 list models 命令；可独立研究 Google API list，但 Gemini CLI runner 默认不应触网 |
| Claude | Sidekick config + aliases/fallback candidates | `configured` 或 `candidate` | unknown | none | none | 本机 `claude --help` 未发现 list models 命令；支持 `sonnet`/`opus` 等 alias，但 alias 不等于账户可用性 |

## 4. `setup` / `list_agents` 是否支持 refresh / validate

应该支持，但必须显式 opt-in。

### 建议参数

```ts
const DiscoveryOptionsSchema = z.object({
  refresh: z.boolean().optional().default(false),
  validate: z.boolean().optional().default(false),
  includeMetadata: z.boolean().optional().default(false),
});
```

### `refresh`

语义：允许 Sidekick 触发 CLI/provider catalog refresh。  
默认：`false`。

OpenCode 映射：

- `refresh: false`：只运行 `opencode models`；Sidekick 不主动加 `--refresh`。
- `refresh: true`：可以运行 `opencode models --refresh`，并在结果中标明 `source.refreshed = true`、`network.discovery = "required"`。

Codex/Gemini/Claude：

- 第一版可以接受参数但返回 warning：`refresh is not supported for this runner; using configured/fallback candidates`。
- 不要为了 refresh 去猜未知 CLI 命令。

### `validate`

语义：允许 Sidekick 做最小真实验证。  
默认：`false`。

风险：可能触网、消耗 quota、触发 provider rate limit；必须在 UX 文案中明说。

建议第一版 validate 策略：

- 只验证已配置 agent 的 `model`，不要验证所有 discovered candidates。
- 每 runner 最多一次极短 prompt，例如“Reply OK only.”，并用 read-only/safe flags。
- 失败不要删除配置，只把 `validation.ok = false` 和 error 填进返回。
- 对 OpenCode 也需要 validate，因为 `opencode models` 不是 API entitlement proof。

### `includeMetadata`

可选，但建议引入：

- `false`：保持 `list_agents` 快速、短输出。
- `true`：OpenCode 可用 `opencode models --verbose` 填 cost/context/capability；其他 runner 仍返回 unknown。

## 5. 最终 UX 文案建议

### `setup` description

```text
Inspect Sidekick runner installation and model discovery sources, then return guidance for creating or updating Sidekick config. By default this uses safe local/configured discovery only. Pass refresh:true to allow catalog refreshes; pass validate:true to run minimal provider checks that may use network and quota.
```

### `list_agents` description

```text
List configured Sidekick helper agents with runner status, selected model, discovery source, confidence, and validation state. Default output does not refresh remote catalogs or spend provider quota.
```

### setup prompt 文案替换

当前文案 “availableModels” 建议替换为：

```text
Discovered model candidates:
- configured: models explicitly present in Sidekick config.
- provider_listed: models listed by the local runner CLI, not yet validated by a real call.
- candidate: Sidekick fallback aliases or documented common models; verify before relying on them.
```

OpenCode 专门提示：

```text
OpenCode discovery uses `opencode models`, which lists models from OpenCode's current provider layer. This is stronger than a static catalog but still not a guarantee that the account can complete a request. Use validate:true for a minimal live check. Sidekick does not run `opencode models --refresh` unless refresh:true is set.
```

`validate:true` 警告：

```text
validate:true may contact provider APIs and consume quota. Sidekick validates only configured agent models, not every discovered candidate.
```

### 返回 JSON 字段名

避免字段名 `availableModels`，改用：

- `configuredModels`
- `discoveredModels`
- `selectedModel`
- `modelConfidence`
- `validation`
- `warnings`

## 推荐实现顺序

1. 先改返回 schema，不改 runner 行为：把当前 `string[]` 包进 `DiscoveredModel`，并标注 source/confidence。
2. 给 `setup` 和 `list_agents` 加 `refresh` / `validate` / `includeMetadata` 参数，默认全 false。
3. OpenCode runner 支持 options：
   - default: `opencode models`
   - refresh: `opencode models --refresh`
   - includeMetadata: `opencode models --verbose`
4. Codex/Gemini/Claude 暂时只返回 config/fallback candidates，并带 warning。
5. validate 另做最小真实调用验证，且只验证 configured selected model。

## 证据与引用

- 本机命令：`opencode --version` -> `1.3.17`；`opencode --help` / `opencode models --help` / `opencode models` / `opencode models --verbose`。
- 本机命令：`opencode providers list` -> credentials 位于 `~/.local/share/opencode/auth.json`，显示 DeepSeek 与 OpenCode Go。
- 本机命令：`opencode models anthropic` -> `Provider not found: anthropic`。
- Upstream source：`/fast/hrz/tmp-sources/anomalyco-opencode/packages/opencode/src/cli/cmd/models.ts`，HEAD `70bb710`。
- Upstream source：`/fast/hrz/tmp-sources/anomalyco-opencode/packages/opencode/src/provider/provider.ts`，Provider state 从 models.dev/config/env/auth/plugin/custom loaders 合成 `providers`。
- Upstream source：`/fast/hrz/tmp-sources/anomalyco-opencode/packages/core/src/models-dev.ts`，models.dev cache/refresh 实现。
- Online docs：`https://www.mintlify.com/anomalyco/opencode/cli/models`。
- Current Sidekick source：`src/runners/registry.ts`，`configuredModels()` 当前对 OpenCode 调 `opencode models`，其他 runner 返回 fallback。
- Current Sidekick source：`src/tools/sidekick.ts`，`setup` / `list_agents` 当前返回简化 `models` / `availableModels`。
