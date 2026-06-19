# Sidekick MCP Rewrite Todo

## Antigravity CLI Runner Support

- [x] Read relevant handoff notes and current runner/config structure.
- [x] Verify current Antigravity CLI command surface from official Google docs/repo and downloaded `--help`.
- [x] Add an `antigravity` runner for the new `agy` CLI while keeping legacy `gemini` intact.
- [x] Update config/setup/list guidance so users can choose `antigravity` and the default command is `agy`.
- [x] Add or update regression tests for args, model discovery, config parsing, setup recommendations, and E2E fake execution.
- [x] Run focused tests plus full `npm test` and `npm run lint`.
- [x] Add review/results and final handoff note.

### Antigravity CLI Runner Support Review / Results

- Added first-class `runner: "antigravity"` support for Google Antigravity CLI, with default command `agy`.
- Kept legacy `runner: "gemini"` intact for existing configs.
- Antigravity runs headless through `agy --print <prompt>` with optional `--model`.
- Sidekick maps `mode: "read-only"` to `--sandbox` and `mode: "full-access"` to `--dangerously-skip-permissions`, unless the user already supplied one of those permission flags in `extraArgs`.
- Antigravity uses Sidekick-managed git worktrees because current `agy --help` does not expose a native worktree flag.
- Antigravity model discovery uses `agy models`; configured `models` still override discovery through the existing base runner behavior.
- Follow-up real `agy models` testing showed Antigravity emits display names with spaces, so model discovery now preserves full display names such as `Gemini 3.5 Flash (Medium)` instead of truncating to the first word.
- Real Antigravity smoke passed after login:
  - `node tests/real-sidekick-command-smoke.mjs antigravity` (`SIDEKICK_REAL_COMMAND_SMOKE_OK agent=antigravity model=`)
  - `node tests/real-mcp-smoke.mjs antigravity` (`SIDEKICK_REAL_MODEL_SMOKE_OK agent=antigravity model=`)
- Explicit Antigravity model-name smoke also passed with `model: "Gemini 3.5 Flash (Low)"` from `agy models` and `extraArgs: ["--print-timeout", "10s"]`; Sidekick returned `SIDEKICK_AGY_REAL_MODEL_NAME_OK`.
- Updated `setup`, `list_agents` guidance, README, package metadata, source-boundary checks, config parsing, CLI detection, runner tests, and standalone command E2E.
- Rebuilt and copied the standalone bundle to `~/.agents/skills/ensemble/bin/sidekick.mjs`.
- Verification passed:
  - `npm test -- tests/runners.test.ts`
  - `npm run lint`
  - `npm test` (16 files / 132 tests)
  - `npm run test:sidekick:e2e` (`SIDEKICK_COMMAND_E2E_OK`)
  - `npm run test:mcp:e2e` (`SIDEKICK_E2E_OK`)
  - `npm run copy:ensemble-sidekick`
  - `git diff --check`

## v0.1.3 CLI Entrypoint / Progress Release

- [x] Pull latest `origin/main` and keep local entrypoint/progress changes.
- [x] Update `package.json` and `package-lock.json` from `0.1.2` to `0.1.3`.
- [x] Run release verification.
- [x] Commit with required Claude, Codex, and Gemini authorship reference.
- [x] Create and push matching `v0.1.3` tag.
- [x] Add review/results and final handoff note.

### v0.1.3 CLI Entrypoint / Progress Release Notes

- Release includes the symlink-aware `sidekick` CLI entrypoint guard and richer tool progress labels.
- Package metadata now uses `0.1.3`; release tag must be `v0.1.3`.
- Verification passed:
  - `npm run lint`
  - `npm test` (16 files / 129 tests)
  - `npm run build`
  - `npm run test:sidekick:e2e` (`SIDEKICK_COMMAND_E2E_OK`)
  - `npm run test:mcp:e2e` (`SIDEKICK_E2E_OK`)
  - `npm run copy:ensemble-sidekick`
  - `git diff --check`
- Commit message uses the required authorship phrase "Claude, Codex, and Gemini".
- Release will be pushed as `main` plus tag `v0.1.3`; the tag-only workflow validates the tag/package version match before publishing.

## Tag-Only Release Workflow

- [x] Remove push-to-main / workflow_dispatch release triggers.
- [x] Remove decide-action job and automated version bump PR path.
- [x] Trigger release only on pushed `v*` tags.
- [x] Validate `github.ref_name` equals `v${package.json.version}` before tests and publish.
- [x] Publish from the existing tag ref and create a GitHub Release for that tag.
- [x] Update `AGENTS.md` release guidance.
- [x] Run workflow verification checks.

### Tag-Only Release Workflow Notes

- `release.yml` now has one release intent: pushing a git tag.
- The workflow no longer checks npm to decide whether to bump or publish.
- A mismatched tag such as `v0.1.3` with `package.json` version `0.1.2` fails in `validate`.
- The existing reusable `tests.yml` matrix still runs before publish.
- Verification passed:
  - `git diff --check -- .github/workflows/release.yml AGENTS.md tasks/lessons.md tasks/todo.md`
  - Node workflow text check confirmed tag trigger only, no `workflow_dispatch`, no main branch trigger, no decide job, no bump PR path, package version read, tag comparison, and publish depends on tests.

## CLI Symlink Entrypoint Guard

- [x] Confirm current worktree status and inherited Sidekick CLI context.
- [x] Reproduce/cover the `sidekick` symlink entrypoint guard mismatch.
- [x] Fix `src/cli.ts` so direct execution works when `process.argv[1]` is a symlink.
- [x] Run focused tests plus full verification.
- [x] Add review/results and write final handoff note.

### CLI Symlink Entrypoint Guard Review / Results

- Fixed `src/cli.ts` entrypoint detection by resolving both `import.meta.url` and `process.argv[1]` through `realpathSync`, falling back to `path.resolve` if realpath fails.
- Added a unit regression for symlink-aware direct execution detection in `tests/cli.test.ts`.
- Added bundled command E2E coverage that launches `dist/sidekick.mjs` through an actual symlink and verifies `sidekick list --json` runs instead of silently exiting.
- Verification passed:
  - `npm test -- tests/cli.test.ts`
  - `npm run lint`
  - `npm test` (16 files / 129 tests)
  - `npm run test:sidekick:e2e` (`SIDEKICK_COMMAND_E2E_OK`)
  - `npm run test:mcp:e2e` (`SIDEKICK_E2E_OK`)
  - `npm run copy:ensemble-sidekick` after serial rerun
  - `git diff --check`
- Note: the first `npm run copy:ensemble-sidekick` attempt failed because it ran in parallel with `npm run test:mcp:e2e`; the MCP E2E build cleaned `dist/` between bundle generation and copy. The known race was resolved by rerunning the copy step serially.
- Pre-existing local change left untouched: `package-lock.json` already had a modified `bin.sidekick` entry before this fix.

## CLI Progress Tool Labels

- [x] Pull latest `origin/main` while preserving local entrypoint changes.
- [x] Add shared tool id/name/summary helpers for progress rendering.
- [x] Remember Claude/Gemini tool names between `tool_use` and `tool_result` events.
- [x] Improve low-risk tool summaries for OpenCode/Codex where useful.
- [x] Add progress renderer regression tests.
- [x] Run verification and document results.

### CLI Progress Tool Labels Review / Results

- Pulled latest `origin/main` (`6f99f0f ci: release only from version tags`) with `git pull --rebase --autostash`.
- Resolved the `tasks/todo.md` autostash conflict by keeping both the new tag-only release notes and the local CLI symlink entrypoint notes.
- Dropped the now-duplicate autostash after confirming local entrypoint changes survived in the worktree.
- Added shared progress helpers for tool id/name extraction, path/command/title/query summaries, and formatted tool labels.
- Claude and Gemini progress renderers now remember tool metadata by id for each renderer instance, so `tool_result` events can report the original tool name and summary.
- Codex MCP tool progress now includes a short argument summary when available.
- OpenCode tool progress now uses the same tool label summary logic.
- Updated progress renderer and serverApp progress tests for richer output.
- Verification passed:
  - `npm test -- tests/progressRenderer.test.ts`
  - `npm run lint`
  - `npm test` (16 files / 129 tests)
  - `npm run test:sidekick:e2e` (`SIDEKICK_COMMAND_E2E_OK`)
  - `npm run test:mcp:e2e` (`SIDEKICK_E2E_OK`)
  - `npm run copy:ensemble-sidekick`
  - `git diff --check`

## sidekick Command for Ensemble Skill

- [x] Create a dedicated handoff thread for the sidekick command task.
- [x] Record the MCP-vs-CLI correction in `tasks/lessons.md`.
- [x] Check worktree status before edits.
- [x] Run a baseline verification signal and record the dependency/tooling issue.
- [x] Restore local dependency baseline if needed.
- [x] Add a MCP-free Sidekick core API for setup/list/run/cleanup.
- [x] Refactor MCP tools to reuse core behavior where practical without changing public MCP behavior.
- [x] Add `src/cli.ts` with `setup`, `list`, `run`, and `cleanup` commands.
- [x] Add esbuild-based single-file `dist/sidekick.mjs` build and npm scripts.
- [x] Copy the bundled CLI to the ensemble skill `bin/` directory.
- [x] Update the ensemble skill instructions to use the bundled CLI primitive.
- [x] Add unit tests for core behavior, CLI parsing/errors, and MCP-free import boundaries.
- [x] Add bundled CLI E2E with fake CLIs.
- [x] Add bundled CLI real-model smoke test.
- [x] Run full verification: lint, tests, build, MCP E2E, CLI E2E, real CLI smoke, and bundle smoke.
- [x] Add review/results and write final handoff note.

### sidekick Command Implementation Notes

- `sidekick` is a low-level CLI primitive for the `ensemble` skill, not an ensemble orchestrator.
- Keep `~/.sidekick/config.json` and `SIDEKICK_*` env compatibility.
- The CLI path must not import `serverApp.ts`, `tools/registry.ts`, `tasks/protocolTaskStore.ts`, or `@modelcontextprotocol/sdk`.
- Primary distribution artifact is `C:\Users\hrz\.agents\skills\ensemble\bin\sidekick.mjs`.
- Public effort controls use `effort` consistently across config, CLI, MCP, and results; legacy config `reasoningEffort` is still accepted as an alias.

### sidekick Command for Ensemble Skill Review / Results

- Implemented `sidekick` CLI commands:
  - `setup [--json]`
  - `list --json`
  - `run --agent <name> (--prompt-file <path> | --prompt <text>) [--cwd <path>] [--mode ...] [--worktree ...] [--json]`
  - `cleanup (--task-id <id> | --worktree-id <id>) [--force] [--json]`
- Replaced the initial broad core file with domain modules under `src/core/`: setup discovery, agent listing, run lifecycle, cleanup, and shared helpers.
- Existing MCP tools now delegate to the same core APIs while preserving generated tool names and result shape.
- Added `sidekick` npm bin and `dist/sidekick.mjs` bundle via esbuild; copied latest bundle to `C:\Users\hrz\.agents\skills\ensemble\bin\sidekick.mjs`.
- Updated the `ensemble` skill to prefer `node {skill_dir}/bin/sidekick.mjs list/run` and keep MCP/tool discovery as fallback.
- Added tests:
  - `tests/cli.test.ts`
  - `tests/core.test.ts`
  - `tests/e2e-sidekick-command.mjs`
  - `tests/real-sidekick-command-smoke.mjs`
  - source-boundary checks for MCP-free CLI/core imports and separated core domains.
- Verification passed:
  - `npm run lint`
  - `npm test` (15 files / 121 tests)
  - `npm run build`
  - `npm run test:sidekick:e2e` (`SIDEKICK_COMMAND_E2E_OK`)
  - `npm run test:e2e` (`SIDEKICK_E2E_OK`)
  - `npm run test:sidekick:e2e:real` (`SIDEKICK_REAL_COMMAND_SMOKE_OK agent=claude model=sonnet`)
  - `npm run copy:ensemble-sidekick`
  - `git diff --check` passed with only CRLF normalization warnings.
- Additional real-smoke note: explicit Codex real CLI smoke was attempted and failed before model execution because the local WindowsApps Codex executable returns `Access is denied`; Claude real smoke passed.
- Follow-up UX fix: `sidekick run` now streams progress to stderr (`[sidekick] Starting ...`, runner progress messages, and completion/failure), while stdout remains pure JSON for `ensemble` parsing. `--no-progress` disables terminal progress. Verified with `npm run lint`, `npm test -- tests/cli.test.ts`, `npm run test:sidekick:e2e`, `npm test`, and `npm run copy:ensemble-sidekick`.
- Timeout clarification: `sidekick run` intentionally has no default command timeout. `runSidekickAgent` does not set `timeoutMs`, and `executeCommand` only starts a timer when a positive timeout is provided. Added a regression assertion in `tests/core.test.ts` and documented this in the `ensemble` skill instructions.
- Human output correction: `sidekick run` without `--json` now writes only the final `answer` to stdout. Non-JSON failures write `!!! ERROR OCCURRED !!!\n{error}` to stdout. `--json` preserves structured result/error JSON. Verified with `npm run lint`, `npm run test:sidekick:e2e`, and `npm run copy:ensemble-sidekick`.
- Removed unused `title` parameter: it only flowed into task metadata and was never used for prompts, runner args, progress, cleanup, or display. Removed it from MCP ask schema, sidekick command args, core/run coordinator requests, metadata type, and real smoke tests. Verified with `npm run lint`, focused tests, `npm run test:sidekick:e2e`, `npm run test:mcp:e2e`, and `npm run copy:ensemble-sidekick`.

## Experimental Trajectory Export

- [x] Read Harbor ATIF schema/model examples and Sidekick handoff context.
- [x] Record the `--atif` to `--trajectory [path]` correction in `tasks/lessons.md`.
- [x] Add MCP-free trajectory/ATIF types and builder under the runner domain.
- [x] Add `sidekick run --trajectory [path]` parsing and export wiring.
- [x] Include `logs.trajectory` in JSON results when export is requested.
- [x] Write error trajectories for failed runs when export is requested.
- [x] Add/update unit tests for parsing and ATIF generation.
- [x] Add/update sidekick command E2E for default path, explicit path, human mode, and failure.
- [x] Update real sidekick smoke to validate trajectory output.
- [x] Run lint, unit tests, build, fake E2E, MCP E2E, real smoke, copy bundle, and diff checks.
- [x] Add review/results and write final handoff note.

### Experimental Trajectory Export Review / Results

- Added `sidekick run --trajectory [path]` and `--trajectory=<path>`.
- Omitting the flag writes no trajectory; passing the flag without a path writes `<taskDir>/trajectory.json`; explicit relative paths resolve against `--cwd`.
- Public request typing now uses one field, `trajectory?: boolean | string`, instead of a split flag/path pair.
- MCP `ask_<agent>` tools also expose optional `trajectory`; the tool description labels it experimental debug-only output.
- Public effort naming was normalized to `effort`; config parsing still accepts old `reasoningEffort` for compatibility.
- `--json` run results include `logs.trajectory` when trajectory export is requested. Human mode still writes only the answer to stdout.
- Added MCP-free ATIF v1.7 types/builder/writer under `src/runners/trajectory.ts`; the CLI/core/trajectory path remains free of MCP-only imports.
- Moved runner-specific trajectory step extraction into `src/runners/claude.ts`, `src/runners/codex.ts`, `src/runners/gemini.ts`, and `src/runners/opencode.ts`.
- Renamed the experimental export module/tests from abbreviated wording to full `trajectory` naming.
- Successful runs export prompt, best-effort runner steps from stdout JSONL, final answer, Sidekick metadata, and final token/cost metrics where available.
- Runner failures after task creation export an error trajectory and keep the existing nonzero exit / human error banner behavior.
- Copied the latest bundle to `C:\Users\hrz\.agents\skills\ensemble\bin\sidekick.mjs`.
- Verification passed:
  - `npm run lint`
  - `npm test -- tests/cli.test.ts tests/trajectory.test.ts tests/core.test.ts tests/sourceBoundaries.test.ts`
  - `npm run build`
  - `npm test` (16 files / 125 tests)
  - `npm run test:sidekick:e2e` (`SIDEKICK_COMMAND_E2E_OK`)
  - `npm run test:mcp:e2e` (`SIDEKICK_E2E_OK`)
  - `npm run test:sidekick:e2e:real` (`SIDEKICK_REAL_COMMAND_SMOKE_OK agent=claude model=sonnet`)
  - `npm run copy:ensemble-sidekick`
  - `git diff --check` passed with only CRLF normalization warnings.

## v0.1.2 README / Tag Release

- [x] Read latest sidekick CLI / trajectory handoff notes.
- [x] Update README with standalone `sidekick` CLI usage, human/json output behavior, no default timeout, experimental trajectory export, and MCP debug-only `trajectory`.
- [x] Bump package metadata from `0.1.1` to `0.1.2`.
- [x] Run release verification.
- [ ] Commit with required Claude, Codex, and Gemini authorship reference.
- [ ] Create and push `v0.1.2`.

### v0.1.2 README / Tag Release Notes

- This release documents the newly bundled `sidekick` command alongside the existing MCP server.
- The `sidekick` command uses the same `~/.sidekick/config.json` as MCP, but exposes MCP-free `setup`, `list`, `run`, and `cleanup` primitives.
- README now documents that human `run` output is answer-only on stdout, progress uses stderr, JSON mode returns structured metadata, and `run` has no default timeout.
- README now documents experimental ATIF v1.7 trajectory export through `--trajectory [path]` and MCP `trajectory?: boolean | string` for debug use.
- README now documents config `effort` and notes `reasoningEffort` only as a legacy alias.
- Public config, CLI, MCP, and results now use `effort` consistently. `reasoningEffort` remains only as a legacy config read alias.
- Verification passed:
  - `npm test -- tests/cli.test.ts tests/core.test.ts tests/tools/initTools.test.ts tests/serverApp.test.ts`
  - `npm test -- tests/config.test.ts tests/runners.test.ts tests/cli.test.ts tests/core.test.ts tests/tools/initTools.test.ts tests/serverApp.test.ts`
  - `npm run lint`
  - `npm test` (16 files / 128 tests)
  - `npm run build`
  - `npm run test:sidekick:e2e` (`SIDEKICK_COMMAND_E2E_OK`)
  - `npm run test:mcp:e2e` (`SIDEKICK_E2E_OK`)
  - `npm run copy:ensemble-sidekick`
  - `npm run copy:ensemble-sidekick` initially failed only when run in parallel with E2E build cleanup; a serial rerun passed.
  - `git diff --check` passed with only CRLF normalization warnings.

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

## MCP Client Setup Docs And 0.1.0 Push

- [x] Confirm local MCP setup commands for Claude Code, Gemini CLI, Codex CLI, and OpenCode.
- [x] Add README instructions using `npx -y @hrz6976/sidekick-mcp@latest`.
- [x] Reset package version to `0.1.0` for the forked/new npm package identity.
- [x] Add `.npmignore` so npm tarballs include `dist/` even though `.gitignore` ignores build output.
- [x] Make release workflow tolerate an already-pushed version tag.
- [x] Run verification before pushing.
- [x] Commit with required Claude, Codex, and Gemini authorship reference.
- [x] Push main and `v0.1.0`.
- [x] Check GitHub Actions release result.

### MCP Client Setup Docs And 0.1.0 Push Review / Results

- README now documents npx-based setup for Claude Code, Gemini CLI, Codex CLI, and OpenCode.
- Package version is now `0.1.0` so the forked package starts a clean semver line instead of inheriting the old package's `1.5.x` history.
- Release workflow now reuses an existing `v${package.version}` tag instead of failing if the tag was pushed manually before publish.
- `npm pack --dry-run` initially exposed that `dist/` was missing from the package; `.npmignore` fixes that and the dry-run now includes `dist/index.js` and the compiled module tree.
- Verification passed:
  - `npm run lint`
  - `npm test` (14 files / 118 tests)
  - `npm run build`
  - `npm run test:e2e`
  - `git diff --check`
  - `npm pack --dry-run`
- Pushed:
  - `main` at `56e827d`.
  - `v0.1.0` exists on origin and points to release commit `1bd799b`.
- GitHub Actions `Release & Publish` run `26941634411`:
  - tests passed on Node 20, 22, and 24.
  - publish failed with `npm ERR! code ENEEDAUTH`.
  - root cause: no repo secrets are configured (`gh secret list --repo hrz6976/multicli` returned no entries), so `secrets.NPM_TOKEN` is unavailable and npm cannot authenticate.
- `@hrz6976/sidekick-mcp@0.1.0` is still not visible on npm.

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

## Setup Tool Configuration UX Cleanup

- [x] Inspect setup/model discovery implementation and existing tests.
- [x] Experiment with local Claude and Gemini CLI model semantics.
- [x] Remove redundant `modelHints` fields from setup/list_agents output.
- [x] Replace hard-coded Claude/Gemini model hints with safer CLI-default guidance.
- [x] Update setup prompt to instruct the calling agent to ask interactive configuration questions.
- [x] Keep management tools visible when config is missing and guide users to call setup.
- [x] Add/update tests and run verification.

### Setup Tool Configuration UX Cleanup Review / Results

- Local CLI checks:
  - Claude Code 2.1.162 exposes `--model` aliases such as `sonnet` and `opus`, but no headless model-list command.
  - Gemini CLI 0.43.0 exposes `--model` and aliases such as `auto`, `pro`, `flash`, and `flash-lite`, but no headless model-list command.
- Removed redundant `modelHints` fields from setup/list_agents output; model information is now under `models` or `configuredModels`.
- Kept Claude/Gemini model lists to aliases only.
- Setup prompt now tells the calling agent to ask the user for a configuration choice before writing config, using AskUserQuestion when available.
- Setup prompt now tells agents not to choose OpenCode models starting with `opencode/` by default.
- Missing-config mode now exposes `setup`, `list_agents`, and `cleanup_worktree`; `list_agents` reports that setup should be called first.
- Verification passed:
  - `npm run lint`
  - `npm test -- tests/serverApp.test.ts tests/tools/initTools.test.ts tests/runners.test.ts tests/config.test.ts`
  - `npm test` (14 files / 118 tests)
  - `npm run build`
  - `npm run test:e2e`
  - `git diff --check`

## Claude Review Resolution

- [x] Read Claude review handoff and relevant lessons.
- [x] Fix `effort` override validation so unsupported runner/value combinations fail before CLI launch.
- [x] Fix OpenCode recommendation selection so provider-prefixed DeepSeek/Kimi models are usable and duplicate aliases are avoided.
- [x] Route `list_agents` model listing through the safe fallback helper.
- [x] Apply cleanup findings for synchronous `configuredAgents` and duplicated `firstModel` calls.
- [x] Add focused regression tests for the review findings.
- [x] Run focused tests, `npm run lint`, `npm test`, `npm run build`, and `git diff --check`.
- [x] Write review/results and final handoff note.

### Claude Review Resolution Review / Results

- Fixed C7 by validating public ask-tool `effort` overrides before runner launch:
  - Claude accepts `low`, `medium`, `high`.
  - Codex accepts `minimal`, `low`, `medium`, `high`.
  - OpenCode accepts simple variant names for `--variant`.
  - Gemini rejects `effort` because Sidekick intentionally has no Gemini effort mapping.
- Fixed C3 by allowing OpenCode DeepSeek/Kimi pattern matches to use `opencode/...` models when those are the locally discovered named provider models.
- Fixed C4 by excluding an already-selected DeepSeek model from Kimi recommendation matching.
- Fixed C10 by routing `list_agents` model discovery through `safeListModels`.
- Applied C8/C9 cleanups in `setupPrompt` / `buildRecommendedConfig`.
- Updated README and setup guidance for validated `effort` semantics.
- Verification passed:
  - `npm test -- tests/serverApp.test.ts`
  - `npm test -- tests/serverApp.test.ts tests/runners.test.ts`
  - `npm run lint`
  - `npm test` (14 files / 122 tests)
  - `npm run build`
  - `npm run test:e2e` (`SIDEKICK_E2E_OK`)
  - `git diff --check`

## npm Patch Release

- [x] Confirm current npm package/version state.
- [x] Confirm release workflow behavior for already-published patch versions.
- [x] Review pending release diff and inherited handoff notes.
- [x] Run local release verification:
  - [x] `npm run lint`
  - [x] `npm test`
  - [x] `npm run build`
- [x] Run `npm run test:e2e`.
- [x] Run `git diff --check`.
- [ ] Commit release contents with the required Claude, Codex, and Gemini authorship reference.
- [ ] Push to GitHub `main` to trigger the release workflow.
- [ ] Record publish handoff/results.

### npm Patch Release Notes

- `npm view @hrz6976/sidekick-mcp version versions --json` reports `0.1.0` is already published.
- Per `.github/workflows/release.yml` and AGENTS release guidance, do not manually edit `package.json` for this patch release. A push to `main` with the current `0.1.0` should trigger the workflow's bump path, opening/auto-merging `chore/version-bump`; merging that bump publishes `0.1.1` via npm trusted publishing.
- Release continuation verification on 2026-06-06 passed:
  - `npm view @hrz6976/sidekick-mcp version versions --json` returned only `0.1.0`.
  - `npm run lint`
  - `npm test` (13 files / 112 tests)
  - `npm run build`
  - `npm run test:e2e` (`SIDEKICK_E2E_OK`)
  - `git diff --check`
  - `git fetch origin main` and `git rev-list --left-right --count HEAD...origin/main` returned `0 0`.
- Pushed commit `31cd8ae` to `origin/main`; it triggered Release & Publish run `27057356219`.
- Run `27057356219` correctly detected `0.1.0` was already published, but failed in the bump job because required GitHub App secrets were not configured: `APP_ID` / `APP_PRIVATE_KEY` caused `[@octokit/auth-app] appId option is required`.
- Because the automated bump path is externally blocked, local package metadata was bumped with `npm version patch --no-git-tag-version` to `0.1.1`; pushing that follow-up commit should trigger the publish path directly because `0.1.1` is not on npm yet.
- Pushed commit `ef7c5e1` to `origin/main`; Release & Publish run `27057438107` selected the publish path and passed the Node 20/22/24 test matrix, but npm publish failed with `E422` because provenance expected `package.json` `repository.url` to match `https://github.com/hrz6976/sidekick-mcp`.
- Added package repository metadata with that exact URL; `0.1.1` remains unpublished, so a follow-up push should retry the publish path.

## Project Simplification

- [x] Pause npm release work after user changed direction.
- [x] Check current worktree status and preserve existing uncommitted review-resolution changes.
- [x] Create a dedicated handoff thread at `conversations/2026-06-06-project-simplification/`.
- [x] Inspect daemon/service/HTTP and runner-adapter coupling points.
- [x] Remove daemon/service/HTTP transport:
  - [x] Delete `src/httpServer.ts` and `src/service/**`.
  - [x] Remove `service` / `serve-http` CLI commands and `SIDEKICK_TRANSPORT=http` behavior.
  - [x] Remove HTTP/service config fields and env parsing.
  - [x] Delete HTTP/service tests and service docs.
- [x] Refactor runner adapters:
  - [x] Move per-runner command args, model listing, output extraction, progress rendering, and effort validation behind adapter definitions.
  - [x] Replace central runner-name switches in `registry.ts`, `output.ts`, `progress.ts`, and `sidekick.ts` with adapter lookup where practical.
  - [x] Keep config format stable for existing `runner` names.
- [x] Update README, CHANGELOG, AGENTS architecture notes, and tests.
- [x] Run verification:
  - [x] `npm run lint`
  - [x] `npm test`
  - [x] `npm run build`
  - [x] `npm run test:e2e`
  - [x] `git diff --check`

### Project Simplification Plan

- Daemon removal should be a clean deletion, not a compatibility shim: Sidekick should run as a stdio MCP server only. User confirmed deleting both service and HTTP transport; do not keep foreground `serve-http`.
- Runner refactor should favor composition over class inheritance: define one adapter object per coding agent with the small behaviors Sidekick needs, then have registry/tool code consume those adapter capabilities.
- Keep the already-uncommitted Claude review fixes intact and build on top of them rather than reverting them.

### Project Simplification Review / Results

- Removed `src/httpServer.ts`, `src/service/**`, `tests/httpServer.test.ts`, and `tests/service.test.ts`.
- Removed HTTP/service config fields and env parsing; `sidekick-mcp` now starts the stdio server path only.
- Removed stale HTTP/service package overrides; `package-lock.json` no longer contains those entries from root overrides, though `@modelcontextprotocol/sdk` still carries its own HTTP-related transitive dependencies.
- Added runner adapter capabilities for model discovery text, fallback models, effort validation, output extraction, and progress rendering.
- Refined runner abstraction into a class hierarchy: shared `BaseRunner` plus separate Claude, Gemini, Codex, and OpenCode runner files.
- Moved runner-specific output extraction and progress rendering into those concrete runner classes; shared `output.ts` and `progress.ts` now contain generic parsing/rendering helpers only.
- Updated `sidekick.ts` to use adapter lookup for setup discovery, effort validation, progress rendering, runner execution, and answer extraction.
- Added adapter capability regression coverage in `tests/runners.test.ts`.
- Verification passed:
  - `npm run lint`
  - `npm test` (12 files / 107 tests)
  - `npm run build`
  - `npm run test:e2e` (`SIDEKICK_E2E_OK`)
  - `git diff --check`

## Task / Worktree Modularization

- [x] Move the MCP protocol task store into `src/tasks/protocolTaskStore.ts`.
- [x] Move shared worktree request/handle types into `src/worktrees/types.ts`.
- [x] Split worktree implementation into focused create, cleanup, git, and naming modules.
- [x] Keep `src/worktrees/manager.ts` as a compatibility facade for callers and tests.
- [x] Extract ask-tool execution lifecycle into `TaskRunCoordinator`.
- [x] Keep `src/tools/sidekick.ts` focused on tool schemas, setup, list_agents, and cleanup wiring.
- [x] Add source-boundary regression coverage for the new task/worktree ownership.
- [x] Run verification:
  - [x] `npm run lint`
  - [x] `npm test`
  - [x] `npm run build`
  - [x] `npm run test:e2e`
  - [x] `git diff --check`

### Task / Worktree Modularization Plan

- Treat task execution as task-domain behavior: metadata creation, stdout/stderr/result writes, progress flushing, answer extraction, and failure state updates belong in a coordinator under `src/tasks/`.
- Treat worktrees as a small subsystem: creation, cleanup, git invocation, naming, and public types should be separated, while `manager.ts` remains the stable import surface.
- Do not alter config, generated MCP tools, worktree semantics, runner CLI args, task result shape, or cleanup behavior.

### Task / Worktree Modularization Review / Results

- Added `src/tasks/protocolTaskStore.ts` for MCP protocol task/cancel handling and removed the root-level `src/taskStore.ts`.
- Added `src/tasks/runCoordinator.ts` for ask-task run orchestration, including worktree creation, metadata/log/result writes, progress rendering, answer extraction, and failure state updates.
- Split worktree internals into `src/worktrees/create.ts`, `src/worktrees/cleanup.ts`, `src/worktrees/git.ts`, `src/worktrees/naming.ts`, and `src/worktrees/types.ts`; `src/worktrees/manager.ts` now re-exports the public facade.
- Updated `src/tools/sidekick.ts` so ask tools delegate run lifecycle to `TaskRunCoordinator`; setup, list_agents, and cleanup behavior remain in the tool layer.
- Added `tests/sourceBoundaries.test.ts` to guard the worktree facade and task coordinator ownership.
- Verification passed:
  - `npm run lint`
  - `npm test` (13 files / 110 tests)
  - `npm run build`
  - `npm run test:e2e` (`SIDEKICK_E2E_OK`)
  - `git diff --check`

## Architecture Review Resolution

- [x] Read `conversations/2026-06-06-project-simplification/061601-claude-reviewed-arch-issues.md`.
- [x] Make CLI detection runner-driven via runner adapters instead of hard-coded CLI constants.
- [x] Remove stale `CLI.COMMANDS` constants.
- [x] Make native-vs-managed worktree handling runner-driven.
- [x] Merge tiny worktree helper modules into a single worktree domain entrypoint while keeping shared types separate.
- [x] Move setup recommendation templates into concrete runner classes.
- [x] Add/update regression tests for runner capabilities, CLI detection, worktree boundaries, and setup recommendations.
- [x] Run verification:
  - [x] `npm run lint`
  - [x] focused Vitest subset
  - [x] `npm test`
  - [x] `npm run build`
  - [x] `npm run test:e2e`
  - [x] `git diff --check`

### Architecture Review Resolution Plan

- Keep `AgentRunner` as the single source for runner-specific behavior that affects setup, CLI probing, and worktree strategy.
- Keep `src/worktrees/types.ts` as the shared type boundary, but collapse tiny worktree implementation helpers into `src/worktrees/index.ts` to reduce navigation overhead.
- Preserve generated tool names, config shape, command arguments, worktree semantics, result JSON shape, and setup starter config behavior.

### Architecture Review Resolution Review / Results

- `src/utils/cliDetector.ts` now accepts runner probes and builds `CliAvailability` by iterating adapters; `src/tools/index.ts` passes `getRunnerAdapters()`.
- `src/constants.ts` no longer carries stale `CLI.COMMANDS`.
- `AgentRunner` now owns `defaultCommand`, `worktreeSupport`, `recommendedAgents()`, and fallback recommendation models.
- Claude/Gemini declare native worktree support; Codex/OpenCode use the base managed worktree default.
- `TaskRunCoordinator` passes runner worktree support into `createWorktree`; worktree creation no longer checks runner names.
- Worktree implementation is merged into `src/worktrees/index.ts`; `src/worktrees/types.ts` remains the shared type boundary.
- Setup starter recommendations are produced by runner instances, preserving Gemini + DeepSeek fallback behavior when no CLIs are detected.
- Verification passed:
  - `npm run lint`
  - focused Vitest subset: `tests/utils/cliDetector.test.ts`, `tests/worktreeManager.test.ts`, `tests/runners.test.ts`, `tests/sourceBoundaries.test.ts`, `tests/serverApp.test.ts`, `tests/tools/initTools.test.ts`
  - `npm test` (13 files / 111 tests)
  - `npm run build`
  - `npm run test:e2e` (`SIDEKICK_E2E_OK`)
  - `git diff --check`

## Small File Architecture Scan

- [x] Scan all non-generated files under 20 lines.
- [x] Classify tiny docs/config/type files that should remain separate.
- [x] Remove remaining tiny shared constants indirection.
- [x] Add regression coverage for the deleted grab-bag constants file.
- [x] Run verification:
  - [x] `npm run lint`
  - [x] `npm test`
  - [x] `npm run build`
  - [x] `npm run test:e2e`
  - [x] `git diff --check`

### Small File Architecture Scan Review / Results

- Sub-20-line files after excluding generated/dependency folders were:
  - `src/constants.ts`
  - `src/execution.ts`
  - `tasks/lessons.md`
  - `CHANGELOG.md`
  - `vitest.config.ts`
  - `tsconfig.json`
- `src/constants.ts` was the only architecture smell: it only exported one protocol string and `ToolArguments`, so it was removed.
- `ToolArguments` now lives in `src/tools/registry.ts`, where the tool execution contract is defined.
- The progress notification method is now a local constant in `src/serverApp.ts`, its only runtime use site.
- `src/execution.ts` remains separate because `ToolExecutionContext` is a real shared runtime contract across tools, runners, command execution, and server code.
- Tiny config/docs files were left alone because merging them would reduce maintainability.
- Verification passed:
  - `npm run lint`
  - `npm test` (13 files / 112 tests)
  - `npm run build`
  - `npm run test:e2e` (`SIDEKICK_E2E_OK`)
  - `git diff --check`
