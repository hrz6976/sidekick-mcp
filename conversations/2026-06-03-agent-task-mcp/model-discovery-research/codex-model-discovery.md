# Codex 模型发现调研

日期：2026-06-04

本机版本：`codex-cli 0.136.0`

## 短结论

1. 没有稳定的普通 CLI 命令用于返回 Codex model catalog。当前可用的是 `codex debug models`，官方 CLI reference 将它标为 `experimental`。
2. `codex debug models --bundled` 只打印当前 Codex binary 内置的 catalog，不刷新远端。`codex debug models` 默认使用 `OnlineIfUncached`：先尝试 `$CODEX_HOME/models_cache.json` fresh cache，cache miss 时在有合适 auth 的情况下调用远端 `/models`。
3. 这个结果不是“账号当前 entitlement”的可靠证明。更准确地说，它是 Codex 当前可见/可构造的 catalog snapshot，受 auth mode、cache、bundled fallback、`model_catalog_json` override、visibility 和 API support filtering 影响。
4. Sidekick setup 如果要使用它，应把结果命名为 `codexCatalog` / `codexVisibleCatalog` / `codexModelHints`，不要叫 `availableModels` 或 `entitledModels`。默认安全策略应优先使用 `--bundled` 或用户配置里的 `models`；远端 refresh 只能作为 best-effort diagnostic，并明确标注 `experimental: true` 和 `entitlementVerified: false`。

## 1. 是否有稳定 CLI 命令返回模型 catalog

没有发现稳定的普通 CLI 命令。

本机 `codex --help` 的顶层命令没有 `models` / `catalog` / `list-models`。相关命令在 `debug` 子命令下：

```text
codex debug models
```

本机 `codex debug --help` 描述为：`models        Render the raw model catalog as JSON`。

本机 `codex debug models --help` 显示：

```text
Render the raw model catalog as JSON

Options:
      --bundled
          Skip refresh and dump only the bundled catalog shipped with this binary
```

Codex manual 的 CLI reference 明确把 `codex debug models` 标为 `experimental`，并描述为打印 Codex sees 的 raw model catalog。对应段落还说 `--bundled` 用于只检查当前 binary bundled catalog，不刷新 remote models endpoint。

结论：`codex debug models` 是当前可用的实证命令，但它属于 debug/experimental surface，不应作为 Sidekick 的稳定依赖契约。`codex app-server` / SDK 里另有 `model/list` / `Codex.models()`，但 app-server 是 Codex rich interface 的内部/实验集成面，不是一个稳定、轻量、普通 CLI list 命令。

## 2. Bundled catalog 与 remote refreshed catalog 的区别

### Bundled catalog

`codex debug models --bundled` 直接走源码里的 `bundled_models_response()`，打印随当前 binary 发布的 `models.json`。本机 0.136.0 的 bundled 结果是 `{ "models": [...] }`，轻量字段显示 6 个条目：

- `gpt-5.5`
- `gpt-5.4`
- `gpt-5.4-mini`
- `gpt-5.3-codex`
- `gpt-5.2`
- `codex-auto-review`（`visibility: "hide"`）

它的特点：

- 不需要 remote refresh。
- 不证明账号可用性。
- 反映的是当前 Codex binary 打包时 OpenAI 给 Codex 的默认 catalog metadata。
- 包含大量 Codex-specific metadata，例如 reasoning levels、visibility、service tiers、tool capability、context window、base instructions、personality variables、truncation policy 等。

### Remote refreshed catalog

`codex debug models` 默认不是简单打印 bundled。源码中 `run_debug_models_command` 在没有 `--bundled` 时：

1. 构造 `Config`。
2. 通过 config/auth 构造 `ModelsManager`。
3. 调用 `raw_model_catalog(RefreshStrategy::OnlineIfUncached)`。

`OnlineIfUncached` 的行为：

- 先尝试 `$CODEX_HOME/models_cache.json`。
- cache 必须匹配当前 client version，且 TTL fresh。源码默认 TTL 是 300 秒。
- cache miss 时才尝试 remote fetch。
- remote fetch 调用 OpenAI-compatible `/models` endpoint，源码里 timeout 是 5 秒，并带 `client_version`。
- fetch 后会把 remote models 和 etag 写入 cache。

是否会真正打 remote 取决于 auth/provider：

- 没有 ChatGPT/Codex backend auth、也没有 command auth 时，refresh 会 no-op，保留 bundled/cache。
- ChatGPT auth 且 remote 返回至少一个 `visibility: "list"` 模型时，remote list 会成为 source of truth。
- ChatGPT auth 但 remote 返回空或只有 hidden model 时，会保留/合并 bundled。
- API key / command auth 模式下，remote 会和 bundled merge，而不是完全替换 bundled。
- 如果配置了 `model_catalog_json`，Codex 会加载该 JSON 并用 `StaticModelsManager`，这相当于显式 static catalog override。

本机实测 `codex debug models` 与 `codex debug models --bundled` 的轻量列表相同。这只说明本次环境下 default output 没有产生不同 remote view，不能推广为两者总是相同。

## 3. 它代表账号 entitlement，还是 Codex 可见 catalog

不要把它解释为账号当前 entitlement。

更准确的语义是：

```text
Codex current model catalog snapshot
```

或者在 UI/Sidekick 中说：

```text
Codex-visible model catalog / Codex model hints
```

原因：

- 无 auth 或不满足 refresh 条件时，默认 `codex debug models` 可以成功返回 bundled catalog。源码测试也覆盖了 `debug models` 在临时 `CODEX_HOME`、无 auth 时仍返回 JSON。
- API-key/auth provider 场景可能 merge bundled 与 remote，因此结果里可能同时有 bundled candidates 和 provider-returned candidates。
- ChatGPT auth 场景 remote 可能更接近当前账号/工作区可见 picker catalog，但命令仍没有执行真实模型请求，不验证 quota、rate limit、workspace admin policy、regional restrictions、cyber reroute、temporary rollout、service tier 可用性等。
- catalog 的 `visibility` 只说明是否应在 Codex picker/list 中展示；`supported_in_api` 只参与非 ChatGPT auth 的过滤；二者都不是最终 entitlement proof。
- `model_catalog_json` 可以由用户配置覆盖，因此 output 也可能是本地 override。

因此 Sidekick 不应该把返回值命名或展示为：

- `entitledModels`
- `availableModels`
- `accountModels`
- `usableModels`

更安全的命名：

- `codexCatalog`
- `codexVisibleCatalog`
- `codexModelHints`
- `codexBundledCatalog`
- `codexRemoteCatalogSnapshot`

如果需要判断某个 model 是否真的可用，唯一可靠方式是运行一个最小实际 Codex invocation，例如 `codex exec --model <model> ...`。这会消耗额度/触发 provider side effects，不适合 setup 默认执行。

## 4. Sidekick setup 应该如何安全调用和命名

### 推荐默认策略

Sidekick setup 默认不要把 Codex refresh 作为强依赖。当前 `setup` 的目标是快速、轻量、安全地产生配置建议，而 `codex debug models` 是 experimental debug command，并且默认可能触发 remote `/models`。

建议分三层：

1. 先使用用户配置的 `agents.<name>.models` 和 `agents.<name>.model`。
2. 如果 Codex CLI 已安装，可选调用 `codex debug models --bundled`，只作为离线 hints。
3. 只有用户显式要求 refresh，或配置明确允许 online discovery 时，才调用 `codex debug models`。

### 建议调用方式

离线 bundled hint：

```shell
codex debug models --bundled
```

online-if-uncached diagnostic：

```shell
codex debug models
```

实现约束：

- 设置短 timeout，例如 8-10 秒；Codex 内部 remote `/models` timeout 是 5 秒，但 wrapper/启动/config 解析仍可能花时间。
- 捕获失败并降级为空 hints 或 configured/fallback hints，不让 setup 失败。
- JSON parse 后只取需要的字段，避免把 `base_instructions` 等大字段塞进 setup prompt。
- 对推荐配置只使用 `visibility === "list"` 的 slugs；`hide` 只用于 diagnostic。
- 记录 provenance：`sourceCommand`、`codexVersion`、`catalogKind`、`refreshed`、`experimental`、`entitlementVerified`。

建议结构：

```json
{
  "runner": "codex",
  "installed": true,
  "modelHints": ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini"],
  "codexCatalog": {
    "kind": "bundled",
    "sourceCommand": "codex debug models --bundled",
    "codexVersion": "codex-cli 0.136.0",
    "experimentalCommand": true,
    "entitlementVerified": false,
    "visibleSlugs": ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex", "gpt-5.2"],
    "hiddenSlugs": ["codex-auto-review"]
  }
}
```

如果允许 online discovery：

```json
{
  "codexCatalog": {
    "kind": "visible_catalog_snapshot",
    "sourceCommand": "codex debug models",
    "refreshStrategy": "online_if_uncached",
    "experimentalCommand": true,
    "entitlementVerified": false
  }
}
```

### Setup 文案建议

当前 Sidekick 文案里 Codex/Gemini/Claude 被描述为 `configured model list or Sidekick fallback models`。如果加入 Codex debug catalog，建议改成更具体的分类：

- `configuredModels`: 来自 Sidekick config。
- `modelHints`: 可用于推荐配置的模型字符串，不承诺可用。
- `codexCatalog`: Codex CLI debug catalog 解析结果。
- `catalogSource`: `configured` / `sidekick_fallback` / `codex_debug_bundled` / `codex_debug_online_if_uncached`。

避免在 `list_agents` / `setup` 中把 Codex `modelHints` 放进名为 `availableModels` 的字段；这个字段对用户和调用 agent 都会暗示“当前账号可调用”。

## 证据来源

- 本机 CLI：
  - `codex --version` -> `codex-cli 0.136.0`
  - `codex --help` -> 无顶层 `models` 命令。
  - `codex debug --help` -> `models` 子命令为 raw model catalog。
  - `codex debug models --help` -> `--bundled` skips refresh and dumps bundled catalog.
  - `codex debug models --bundled` 与 `codex debug models` 本次轻量 slugs 相同。
- Codex manual：
  - `/tmp/openai-docs-cache/codex-manual.md`
  - CLI reference lines around `codex debug models` state it is experimental and `--bundled` skips refresh.
  - Model selection section documents `--model` and config `model`, but does not document a stable ordinary CLI catalog command.
- OpenAI Codex source:
  - `/tmp/openai-codex-source`, tag `rust-v0.136.0`.
  - `codex-rs/cli/src/main.rs`: `DebugSubcommand::Models` and `run_debug_models_command`.
  - `codex-rs/models-manager/src/manager.rs`: `RefreshStrategy`, cache, remote refresh, merge/source-of-truth rules.
  - `codex-rs/models-manager/src/cache.rs`: cache file semantics and 300s TTL.
  - `codex-rs/model-provider/src/models_endpoint.rs`: remote `/models` endpoint and 5s timeout.
  - `codex-rs/protocol/src/openai_models.rs`: `ModelsResponse`, `ModelInfo`, `visibility`, `supported_in_api`, and `ModelPreset` conversion/filtering.
  - `codex-rs/app-server/src/models.rs`: app-server `model/list` uses `OnlineIfUncached` and filters hidden entries unless requested.
