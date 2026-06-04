# Codex Handoff - Correction Pass Verified

## Context

User challenged the previous completion as insufficient and explicitly requested:

1. Rename configuration files and environment variables from `sidekick_mcp` / `SIDEKICK_MCP` to `sidekick` / `SIDEKICK`.
2. Clean dead code.
3. Perform detailed end-to-end testing, including model and subagent usage, to prove the design target.

## What Changed

- Renamed Sidekick runtime/config surface:
  - Default home is now `~/.sidekick`.
  - Config override is `SIDEKICK_CONFIG_PATH`.
  - Runtime env uses `SIDEKICK_*`, including service env files.
  - Package/binary intentionally remain `@hrz6976/sidekick-mcp` / `sidekick-mcp`.
- Deleted obsolete Multi-CLI implementation files:
  - Old Ask-* tools, model catalog refresh/generation, direct executor wrappers, chunk/change-mode utilities, old client filtering, and obsolete tests.
  - Removed stale catalog refresh workflow and old CODEOWNERS.
- Updated CI/release:
  - Test workflow now runs `npm run test:e2e`.
  - Release workflow checks npm package `@hrz6976/sidekick-mcp`.
- Added E2E coverage:
  - `tests/e2e-sidekick.mjs` starts the built MCP server over stdio with fake CLIs and validates setup mode, configured tool registration, task execution, logs/result files, managed worktree creation, and cleanup.
  - `tests/real-model-smoke.mjs` starts the built MCP server and calls a real CLI/model through `sidekick_start_task`.
- Fixed real CLI runner issues found by E2E:
  - Claude stream-json runner now includes `--verbose`.
  - Codex runner no longer uses unsupported `--ask-for-approval never`.
  - Runners omit `--model` when Sidekick resolves to CLI default model.
  - Real smoke script now supplies MCP roots and omits empty `model` arguments.
- Captured correction lessons in `tasks/lessons.md` and updated `tasks/todo.md` with final results.

## Verification

Passed:

- `npm run lint`
- `npm test` (12 files / 96 tests)
- `npm run test:e2e` (`SIDEKICK_E2E_OK`)
- `npm run test:e2e:real -- codex` (`SIDEKICK_REAL_MODEL_SMOKE_OK agent=codex model=`)
- `npm run build`

Additional notes:

- Naming scan passed with no `SIDEKICK_MCP`, `sidekick_mcp`, or `~/.sidekick-mcp` outside historical conversation files/build artifacts.
- Scan for old `MultiCli`, `Multi-CLI`, `@osanoai`, and `multicli` also passed outside historical conversation files/build artifacts.
- Direct Claude real smoke was blocked by local account session limit; Codex real smoke is the successful real model/subagent proof.

## Current State

Worktree is intentionally dirty with the Sidekick rewrite and correction pass. Do not revert unrelated files. There are untracked handoff notes from this task and new Sidekick files/tests.

