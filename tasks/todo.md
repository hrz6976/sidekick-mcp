# Sidekick MCP Rewrite Todo

## Phase 0 - Plan And Guardrails

- [x] Read all handoff notes in `conversations/2026-06-03-agent-task-mcp/`.
- [x] Confirm current worktree status before source edits.
- [x] Run baseline verification signal before implementation (`npm run lint` failed because `tsc` was not installed in the workspace).
- [x] Keep this checklist updated as phases complete.
- [x] Add a review/results section before marking the goal complete.

## Phase 1 - Rename And Package Surface

- [x] Rename npm package to `@hrz6976/sidekick-mcp`.
- [x] Rename binary to `sidekick-mcp`.
- [x] Remove stale `osanoai/multicli` repository metadata.
- [x] Keep scripts focused on build/start/dev/test/lint plus existing useful maintenance commands.
- [x] Sync `package-lock.json`.

## Phase 2 - Config And Sidekick Home

- [x] Use `~/.sidekick` as Sidekick home.
- [x] Load config from `~/.sidekick/config.json` by default.
- [x] Support `SIDEKICK_CONFIG_PATH` override.
- [x] Stop reading `MULTICLI_*` environment variables.
- [x] Treat missing config as setup-only mode, not startup failure.

## Phase 3 - Tool Surface

- [x] Stop registering old tools (`Ask-*`, `List-*-Models`, help, chunk, important-read-now).
- [x] Implement `sidekick_setup`.
- [x] Implement task-only `sidekick_start_task`.
- [x] Implement `sidekick_list_models`.
- [x] Implement `sidekick_cleanup_worktree`.
- [x] Ensure tool annotations and schemas match the handoff requirements.

## Phase 4 - Runner Registry

- [x] Add runner type definitions and registry.
- [x] Add Claude command construction.
- [x] Add Gemini command construction with `--skip-trust` handling.
- [x] Add Codex command construction using `exec --json --cd`.
- [x] Add OpenCode command construction using `run --dir --format json`.
- [x] Ensure OpenCode model listing never uses `--refresh`.

## Phase 5 - Worktree Manager

- [x] Add Sidekick-managed worktree creation under `~/.sidekick/worktrees`.
- [x] Use native worktree records for Claude/Gemini.
- [x] Reject non-git repos with actionable errors.
- [x] Restrict cleanup to Sidekick metadata.
- [x] Refuse dirty cleanup unless `force: true`.

## Phase 6 - Task Metadata And Logs

- [x] Persist task metadata under `~/.sidekick/tasks/<taskId>/`.
- [x] Write stdout/stderr/result files.
- [x] Mark completed/failed/cancelled states.
- [x] Mark stale running tasks interrupted on startup.
- [x] Include cleanup hint in task results.

## Phase 7 - Server Wiring

- [x] Rename server identity and logger bindings to Sidekick.
- [x] Register only setup tool when config is missing.
- [x] Register only target Sidekick tools when config exists.
- [x] Preserve progress and cancellation support for task execution.
- [x] Return actionable tool errors instead of protocol crashes.

## Phase 8 - Docs And Cleanup

- [x] Rewrite README for Sidekick.
- [x] Update CHANGELOG with breaking rewrite note.
- [x] Delete or ignore obsolete old tool tests.
- [x] Add focused tests for config, tools, runners, worktrees, metadata, and server behavior.
- [x] Run `npm run lint`.
- [x] Run `npm test`.
- [x] Run `npm run build`.

## Review / Results

- `npm run lint`: passed.
- `npm test`: passed, 12 files / 96 tests after removing obsolete Multi-CLI dead-code tests.
- `npm run build`: passed.
- `npm run test:e2e`: passed with `SIDEKICK_E2E_OK`.
- `npm run test:e2e:real -- codex`: passed with `SIDEKICK_REAL_MODEL_SMOKE_OK agent=codex model=` (empty model means Codex CLI default).
- Built smoke check:
  - missing config registered `sidekick_setup`.
  - minimal config registered `sidekick_start_task`, `sidekick_list_models`, `sidekick_cleanup_worktree`.

## Correction Pass - User Feedback

- [x] Rename config/runtime paths from `~/.sidekick-mcp` to `~/.sidekick`.
- [x] Rename environment variables from `SIDEKICK_MCP_*` to `SIDEKICK_*`.
- [x] Keep package and binary as `@hrz6976/sidekick-mcp` / `sidekick-mcp` unless explicitly changed.
- [x] Remove dead code left from old model catalogs, change-mode chunking, service helpers if no longer used.
- [x] Add detailed end-to-end tests that exercise built MCP server behavior rather than only unit-level functions.
- [x] Run real CLI/model smoke or record exact external blocker.
- [x] Use subagent audit feedback before final answer.
- [x] Re-run `npm run lint`.
- [x] Re-run `npm test`.
- [x] Re-run `npm run build`.

## Correction Pass Review / Results

- Naming audit passed: no `SIDEKICK_MCP`, `sidekick_mcp`, or `~/.sidekick-mcp` remains in source, tests, docs, install script, package files, or GitHub workflows.
- Dead-code cleanup removed old direct ask tools, model catalog generation, chunk/change-mode utilities, old executor wrappers, stale catalog refresh workflow/script, and obsolete tests for those modules.
- Subagent audit findings were applied: release npm package check now targets `@hrz6976/sidekick-mcp`, old CODEOWNERS was removed, internal `MultiCli*` names were renamed, fake E2E is part of CI, and real E2E is available as a gated script.
- Final verification passed:
  - `npm run lint`
  - `npm test` (12 files / 96 tests)
  - `npm run test:e2e`
  - `npm run test:e2e:real -- codex`
  - `npm run build`
- Claude real smoke was checked separately and blocked by the local Claude account session limit, so Codex CLI default-model smoke is the successful real model/subagent proof for this pass.

## Four-Agent E2E / Dead-Code Audit - User Follow-Up

- [x] Expanded `tests/e2e-sidekick.mjs` to run built-server fake CLI E2E for Claude, Gemini, Codex, and OpenCode.
- [x] Added `npm run test:e2e:real:all` to run real model smoke for Claude, Gemini, Codex, and OpenCode after one build.
- [x] Deleted stale `tests/INSTRUCTIONS.md`, which still described old `{cli-name}-ask` / `{cli-name}-list-models` behavior.
- [x] Narrowed unused internal exports reported by `knip`.
- [x] Ran `npx --yes knip`: passed with no unused files/exports.
- [x] Ran old naming/tool scan: no `SIDEKICK_MCP`, `sidekick_mcp`, `~/.sidekick-mcp`, `MultiCli`, `Multi-CLI`, `@osanoai`, `multicli`, or old Ask-* tool names remain outside historical conversations/build artifacts.
- [x] Final serial verification passed:
  - `npm test` (12 files / 96 tests)
  - `npm run test:e2e` (`SIDEKICK_E2E_OK`; covers all four agents with fake CLIs through built MCP server)
  - `npm run test:e2e:real:all`
    - `SIDEKICK_REAL_MODEL_SMOKE_OK agent=claude model=sonnet`
    - `SIDEKICK_REAL_MODEL_SMOKE_OK agent=gemini model=`
    - `SIDEKICK_REAL_MODEL_SMOKE_OK agent=codex model=`
    - `SIDEKICK_REAL_MODEL_SMOKE_OK agent=opencode model=`
  - `npm run build`

## Config-Generated Ask Tools Redesign

- [x] Removed the generic public ask tool contract from the active design.
- [x] Changed config so `agents` is the public helper-agent map; each key becomes `ask_<agent>`.
- [x] Added per-agent `runner`, `model`, `extraArgs`, `description`, and `enabled` config fields.
- [x] Kept runner names internal: `claude`, `gemini`, `codex`, and `opencode`.
- [x] Renamed management tools to `setup`, `list_agents`, and `cleanup_worktree`.
- [x] Added setup/tool guidance:
  - read-only investigations usually use `mode: "read-only"` and no worktree.
  - edit/full-access tasks should prefer `worktree: "auto"` to avoid concurrent edits.
  - Gemini gets `--skip-trust` by default from the runner.
  - `reasoningEffort` is for common effort controls; `extraArgs` is for other advanced CLI/model options.
- [x] Updated README, CHANGELOG, AGENTS, tests, fake E2E, and real model smoke to the new contract.
- [x] Final verification passed:
  - `npm run lint`
  - `npm test` (12 files / 98 tests)
  - `npm run test:e2e`
  - `npm run test:e2e:real:all`
  - `npm run build`
  - `npx --yes knip`
  - legacy naming/tool scan (excluding historical conversations, task notes, dependencies, and build output)

## Cwd Parameter Cleanup

- [x] Remove the public `cwd` parameter from generated `ask_<agent>` tools.
- [x] Keep execution rooted in MCP client roots or the MCP server launch directory fallback.
- [x] Update setup/tool prompts so agents rely on roots/server cwd instead of passing `cwd`.
- [x] Re-run focused and full verification.

### Cwd Parameter Cleanup Review / Results

- Removed unfinished public `cwd` support from `src/tools/sidekick.ts`.
- Kept internal execution base directory as `context.cwd ?? process.cwd()`, preserving MCP roots and server launch directory fallback behavior.
- Verification passed:
  - `npm run lint`
  - `npm test` (12 files / 98 tests)
  - `npm run test:e2e`
  - `npm run build`

## GitHub Actions Cleanup / npm Publish Guidance

- [x] Remove unused security scan workflows.
- [x] Remove now-unused CodeQL config.
- [x] Simplify release publish path so it runs tests directly before npm publish.
- [x] Verify no workflow references remain to removed scan jobs.
- [x] Document npm registry publish steps for the user.

### GitHub Actions Cleanup Review / Results

- Removed `.github/workflows/scan.yml`.
- Removed `.github/workflows/scorecard.yml`.
- Removed `.github/codeql/codeql-config.yml`.
- Updated `.github/workflows/release.yml` publish path from `check -> scan -> test -> publish` to `check -> test -> publish`.
- Added optional `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` to the publish step so the first package publish can be bootstrapped before npm trusted publishing exists.
- Verification passed:
  - `rg -n "scan\\.yml|scorecard|CodeQL|Shai-Hulud|Security Scan|codeql" .github README.md AGENTS.md CHANGELOG.md package.json` returned no matches.
  - `git diff --check` passed for the workflow/config/task-note changes.

## MCP Tasks Compatibility Pass

- [x] Check current MCP Tasks docs/SDK behavior for task augmentation and per-tool `taskSupport`.
- [x] Confirm Claude Code's actual tool-call path still sends ordinary `tools/call` rather than task augmentation.
- [x] Accept task creation params from both `params.task` and `_meta.task`.
- [x] Change generated `ask_<agent>` tools from `taskSupport: "required"` to `taskSupport: "optional"`.
- [x] Allow ordinary direct `ask_<agent>` calls to run synchronously while still creating Sidekick task metadata/logs.
- [x] Update unit, integration, E2E, and docs expectations.
- [x] Rebuild and retry a real Claude Code MCP call.

### MCP Tasks Compatibility Review / Results

- Official MCP Tasks docs describe task augmentation as an experimental extension negotiated by client/server capabilities, not a guaranteed path for every MCP client.
- The TypeScript SDK exposes `execution.taskSupport` as `forbidden | optional | required`; `optional` is the right fit for broad client compatibility.
- Verification passed:
  - `npm test -- tests/serverApp.test.ts tests/tools/initTools.test.ts`
  - `npm run lint`
  - `npm test` (12 files / 99 tests)
  - `npm run test:e2e`
  - `npm run build`
- Real Claude Code probe no longer fails at the MCP protocol/task layer. It entered Sidekick through a normal `tools/call`, spawned Gemini, and then failed at the provider layer because the configured Gemini model `gemini-3.1-pro` returned `ModelNotFoundError: Requested entity was not found`.

## Provider Progress Rendering

- [x] Read existing handoff notes and create `progress-research` subagent output folder.
- [x] Spawn subagents for Claude/Gemini progress research, Codex/OpenCode progress research, and MCP progress best practices.
- [x] Collect subagent research findings.
- [x] Design a small provider-specific progress renderer API.
- [x] Implement renderer integration without changing runner command contracts.

## Codex Model Discovery Research

- [x] Inspect local Codex CLI help and installed command behavior for any model catalog command.
- [x] Read `/tmp/openai-docs-cache/codex-manual.md` and refresh through the `openai-docs` helper if needed.
- [x] Inspect Codex source or official docs for bundled vs remote refreshed model catalog semantics.
- [x] Write conclusions to `conversations/2026-06-03-agent-task-mcp/model-discovery-research/codex-model-discovery.md`.
- [x] Verify the report answers the four requested questions.

### Codex Model Discovery Research Review / Results

- Confirmed local `codex-cli 0.136.0` exposes `codex debug models`, not a stable top-level model listing command.
- Confirmed the Codex manual marks `codex debug models` as experimental and documents `--bundled`.
- Confirmed source semantics from OpenAI Codex tag `rust-v0.136.0`: bundled catalog, `OnlineIfUncached` refresh, 300s cache TTL, `/models` 5s timeout, auth-dependent merge/source-of-truth behavior.
- No source files were modified.

## Claude Model Discovery Research

- [x] Check local `claude --help` / related help output for any headless or JSON model listing command.
- [x] Search `/fast/hrz/tmp-sources/yasasbanukaofficial-claude-code` for `/model`, `availableModels`, `validateModel`, `modelCapabilities`, and `anthropic.models.list`.
- [x] Check official Anthropic documentation for Models API semantics.
- [x] Decide whether each source can represent the current account's usable Claude Code model set.
- [x] Write conclusions to `conversations/2026-06-03-agent-task-mcp/model-discovery-research/claude-model-discovery.md`.
- [x] Add review/results notes and final handoff.

### Claude Model Discovery Research Review / Results

- `claude` CLI 2.1.162 does not expose a public `models` / `list-models` / `--models` headless JSON catalog command.
- Claude Code source shows `/model` is an interactive picker/config command; `availableModels` is an admin allowlist; `validateModel` is a one-candidate minimal real API call; `modelCapabilities` is an internal Ant/first-party capabilities cache using `anthropic.models.list`.
- Anthropic `GET /v1/models` exists for API key/workspace discovery, but it is not the same as Claude Code CLI OAuth/subscription availability.
- No API or real model validation call was executed because `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` were absent, and setup should not spend quota by default.
- `git diff --check -- tasks/todo.md conversations/2026-06-03-agent-task-mcp/model-discovery-research/claude-model-discovery.md` passed.
- [x] Add focused tests for CLI stdout chunk translation.
- [x] Run lint, unit tests, E2E, and build.
- [x] Write final handoff note.

### Provider Progress Rendering Review / Results

- Subagent research files:
  - `conversations/2026-06-03-agent-task-mcp/progress-research/claude-gemini-progress.md`
  - `conversations/2026-06-03-agent-task-mcp/progress-research/codex-opencode-progress.md`
  - `conversations/2026-06-03-agent-task-mcp/progress-research/mcp-progress-best-practices.md`
- Added `src/runners/progress.ts`, a runner-aware JSONL progress renderer for Claude, Gemini, Codex, and OpenCode.
- Integrated renderer in `src/tools/sidekick.ts` so raw CLI stdout remains in task logs/results while MCP progress receives short human-readable messages.
- Fixed MCP progress final notifications to keep progress values monotonic for unknown-total long tasks.
- Added focused renderer tests and an E2E progress-token assertion through the built MCP server.
- Verification passed:
  - `npm test -- tests/progressRenderer.test.ts tests/serverApp.test.ts`
  - `npm run lint`
  - `npm test` (13 files / 105 tests)
  - `npm run test:e2e`
  - `npm run build`
  - `git diff --check`

## Ask Result Surface Cleanup

- [x] Add runner-aware final answer extraction from CLI JSONL/stdout.
- [x] Return `answer` plus task metadata from `ask_<agent>` tools instead of raw `stdout`.
- [x] Keep full raw stdout/stderr in task log files for debugging.
- [x] Remove duplicate final stdout append after chunk logging.
- [x] Update tests and docs for the cleaner result surface.
- [x] Run focused and full verification.

### Ask Result Surface Cleanup Review / Results

- Added `src/runners/output.ts` to extract clean final answers from Claude, Gemini, Codex, and OpenCode JSONL/stdout.
- Updated `ask_<agent>` results to include `answer` and optional `stats`, while omitting raw `stdout` from the MCP tool response.
- Kept raw stdout in `stdout.log`; completion only writes missing stdout content, avoiding the previous duplicate append when chunks were already logged.
- Updated README, unit tests, real smoke expectations, and built-server E2E assertions.
- Verification passed:
  - `npm test -- tests/outputExtraction.test.ts tests/serverApp.test.ts`
  - `npm run lint`
  - `npm test` (14 files / 111 tests)
  - `npm run build`
  - `npm run test:e2e`
  - `git diff --check`

## Always-On Setup Tool

- [x] Keep `setup` exposed even after Sidekick config exists.
- [x] Add lightweight runner/model discovery to setup output.
- [x] Include existing config summary and a recommended starter config.
- [x] Guide the calling agent to create or patch `~/.sidekick/config.json`.
- [x] Update tests, README, and E2E expectations.
- [x] Run focused and full verification.

### Always-On Setup Tool Review / Results

- `setup` is now always registered in configured mode, before generated `ask_<agent>` tools.
- Setup output now includes current config status, configured agents, runner availability, discovered/configured model hints, and a recommended starter config.
- Setup prompt explicitly tells the calling agent to patch existing config instead of overwriting unrelated agents.
- Model discovery remains lightweight: OpenCode uses `opencode models`; other runners use configured model lists or Sidekick fallback models.
- Verification passed:
  - `npm test -- tests/tools/initTools.test.ts tests/serverApp.test.ts`
  - `npm run lint`
  - `npm test` (14 files / 112 tests)
  - `npm run build`
  - `npm run test:e2e`
  - `git diff --check`

## Model Discovery Research

- [x] Spawn independent subagents for Codex/OpenAI, Gemini, Claude/Anthropic, and OpenCode/general discovery strategy.
- [x] Collect each subagent's written research artifact.
- [x] Synthesize which runners can produce live catalogs, bundled catalogs, configured/allowed models, or only candidates.
- [x] Recommend setup/list_agents return semantics that avoid calling static fallbacks "currently available".
- [x] Write a handoff note with the research outcome.

### Model Discovery Research Review / Results

- Subagent research files:
  - `conversations/2026-06-03-agent-task-mcp/model-discovery-research/codex-model-discovery.md`
  - `conversations/2026-06-03-agent-task-mcp/model-discovery-research/gemini-model-discovery.md`
  - `conversations/2026-06-03-agent-task-mcp/model-discovery-research/claude-model-discovery.md`
  - `conversations/2026-06-03-agent-task-mcp/model-discovery-research/opencode-general-model-discovery.md`
- Codex has only experimental/debug catalog discovery: `codex debug models --bundled` is offline bundled catalog; `codex debug models` may use cache or refresh remote `/models`. Neither proves entitlement.
- OpenCode has the strongest CLI discovery: `opencode models [provider]`, with optional `--verbose` metadata and `--refresh`; it is provider-layer discovery, not live validation.
- Gemini has no headless/json model-list command; `/model` is interactive config, and source constants/services are candidate/config/routing data, not account availability.
- Claude Code has no public headless/json model-list command; `/model`, `availableModels`, `validateModel`, and internal `anthropic.models.list` capability cache have different semantics and should not be conflated.
- Recommended Sidekick semantics: replace ambiguous `availableModels` with `configuredModels`, `discoveredModels`, `modelHints`, `selectedModel`, `source`, `confidence`, and `validation`; add opt-in `refresh`, `validate`, and optionally `includeMetadata`, all defaulting to `false`.

## Model Discovery Implementation

- [x] Parse Codex model hints locally from `codex debug models --bundled`.
- [x] Keep OpenCode model hints parsed locally from `opencode models` without `--refresh`.
- [x] Use Sidekick built-in model hint lists for Gemini and Claude.
- [x] Rename setup/list_agents wording away from ambiguous "available models" toward "model hints".
- [x] Update README and tests for the new model-discovery strategy.
- [x] Run focused and full verification.

### Model Discovery Implementation Review / Results

- Codex now reads local bundled model hints via `codex debug models --bundled`, excludes hidden catalog entries, and falls back to built-in Codex hints if parsing fails.
- OpenCode continues to read local provider-layer model hints via `opencode models` and never adds `--refresh`.
- Gemini and Claude use Sidekick built-in CLI aliases/candidates: Gemini starts with `auto`, Claude starts with `sonnet`.
- setup/list_agents now say `modelHints` instead of `availableModels`; README uses Gemini `auto` in the starter config.
- Verification passed:
  - `npm test -- tests/runners.test.ts tests/serverApp.test.ts tests/tools/initTools.test.ts`
  - `npm run lint`
  - `npm test` (14 files / 115 tests)
  - `npm run build`
  - `npm run test:e2e`
  - `git diff --check`

## Reasoning Effort Config

- [x] Add `reasoningEffort` to Sidekick agent config parsing.
- [x] Map `reasoningEffort` to Claude `--effort`.
- [x] Map `reasoningEffort` to Codex `--config model_reasoning_effort=...`.
- [x] Map `reasoningEffort` to OpenCode `--variant`.
- [x] Leave Gemini without automatic injection because Gemini CLI has no direct headless reasoning-effort flag.
- [x] Update setup/list_agents output, README, and tests.
- [x] Run focused and full verification.

### Reasoning Effort Config Review / Results

- `reasoningEffort` is now parsed from each agent config and included in setup/list_agents output.
- Runner mappings:
  - Claude: `--effort <value>`
  - Codex: `--config model_reasoning_effort="<value>"`
  - OpenCode: `--variant <value>`
  - Gemini: no automatic flag injection because the local Gemini CLI exposes no headless reasoning-effort option.
- Existing equivalent flags in `extraArgs` are respected and not duplicated.
- README now documents `reasoningEffort` and keeps `extraArgs` for other advanced options.
- Verification passed:
  - `npm test -- tests/runners.test.ts tests/config.test.ts tests/serverApp.test.ts tests/tools/initTools.test.ts`
  - `npm run lint`
  - `npm test` (14 files / 117 tests)
  - `npm run build`
  - `npm run test:e2e`
  - `git diff --check`

## Ask Tool Effort Override

- [x] Add public `effort` to generated `ask_<agent>` tool schemas.
- [x] Treat `effort` as a one-call override for config `reasoningEffort`.
- [x] Return the effective effort in ask tool results when one is set.
- [x] Update setup/list_agents guidance and README so calling agents use `effort` at tool-call time.
- [x] Run focused and full verification.

### Ask Tool Effort Override Review / Results

- `ask_<agent>` tools now expose public `effort`; it overrides config `reasoningEffort` for that call only.
- The effective effort is passed through existing runner mappings and included in the ask result when set.
- Verification passed:
  - `npm test -- tests/serverApp.test.ts tests/tools/initTools.test.ts`
  - `npm run lint`
  - `npm test` (14 files / 118 tests)
  - `npm run build`
  - `npm run test:e2e`
  - `git diff --check`

### Gemini Model Discovery Research

- [x] Read existing handoff notes and lessons for model-discovery constraints.
- [x] Confirm current worktree status and avoid source edits.
- [x] Inspect local `gemini` version/help for model listing and model-selection flags.
- [x] Clone or update `google-gemini/gemini-cli` under `/fast/hrz/tmp-sources/google-gemini-cli`.
- [x] Inspect Gemini CLI source for `/model`, `--model`, `GEMINI_MODEL`, `settings.json`, `VALID_GEMINI_MODELS`, `ModelConfigService.getAvailableModelOptions`, and `ModelAvailabilityService`.
- [x] Check official Gemini CLI / Google AI API docs for model listing semantics.
- [x] Write conclusions to `conversations/2026-06-03-agent-task-mcp/model-discovery-research/gemini-model-discovery.md`.
- [x] Add review/results and handoff note.

#### Gemini Model Discovery Review / Results

- Local Gemini CLI `0.45.0` has no `models` / `list models` headless command; `gemini models --help` and `gemini list --help` both returned top-level help.
- Cloned/updated `google-gemini/gemini-cli` at `/fast/hrz/tmp-sources/google-gemini-cli`, HEAD `4196596f7f48c0c397776f0cb7862c88d8fae91e`.
- Source inspection showed `/model` is an interactive slash command, `--model > GEMINI_MODEL > settings.model.name > default auto`, and bundled model registries are candidates/config options rather than live account catalogs.
- Google AI API `models.list` exists, but should be opt-in and labeled as Gemini API catalog; it does not equal Gemini CLI current-account availability.
- Report written to `conversations/2026-06-03-agent-task-mcp/model-discovery-research/gemini-model-discovery.md`.

## MCP Client Setup Docs And Push

- [x] Confirm local MCP setup commands for Claude Code, Gemini CLI, Codex CLI, and OpenCode.
- [x] Avoid pre-creating the package release tag because the release workflow creates `v${package.version}` after npm publish.
- [x] Add README instructions using `npx -y @hrz6976/sidekick-mcp@latest`.
- [x] Run verification before pushing.
- [ ] Commit with required Claude, Codex, and Gemini authorship reference.
- [ ] Push main and an appropriate non-conflicting git tag.

### MCP Client Setup Docs And Push Review / Results

- README now documents npx-based setup for Claude Code, Gemini CLI, Codex CLI, and OpenCode.
- Local `package.json` / `package-lock.json` currently contain an unrelated version change from `1.5.40` to `0.1.0`; this push intentionally excludes those files so release versioning remains under the existing workflow.
- Verification passed:
  - `npm run lint`
  - `npm test` (14 files / 118 tests)
  - `npm run build`
  - `npm run test:e2e`
  - `git diff --check`
- Push pending.

### OpenCode / General Model Discovery Research

- [x] Read existing handoff notes and lessons for model-discovery constraints.
- [x] Confirm current worktree status and avoid source edits.
- [x] Verify local OpenCode CLI help and model-list behavior.
- [x] Check upstream `anomalyco/opencode` / current OpenCode repository documentation or source for model commands.
- [x] Inspect current Sidekick model discovery code path in `src/tools/sidekick.ts` and `src/runners/registry.ts`.
- [x] Design a common discovery schema for OpenCode, Codex, Gemini, and Claude.
- [x] Decide whether `setup` and `list_agents` need `refresh` / `validate` parameters.
- [x] Write conclusions to `conversations/2026-06-03-agent-task-mcp/model-discovery-research/opencode-general-model-discovery.md`.

#### OpenCode / General Model Discovery Research Review / Results

- Confirmed local OpenCode 1.3.17 has `opencode models [provider]`, `--verbose`, and `--refresh`.
- Confirmed upstream `anomalyco/opencode` HEAD `70bb710` defines the same command in `packages/opencode/src/cli/cmd/models.ts`.
- Determined `opencode models` prints OpenCode's current provider-layer model set, not the full models.dev catalog and not a live validation result.
- Recommended a structured model discovery schema with explicit source/confidence/cost/network/quota-risk/validation fields.
- Recommended `setup` and `list_agents` accept `refresh`, `validate`, and optionally `includeMetadata`, all defaulting to false.
- Wrote report: `conversations/2026-06-03-agent-task-mcp/model-discovery-research/opencode-general-model-discovery.md`.
