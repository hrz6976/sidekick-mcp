# Handoff: Tool-Side Effort Override

## Summary

Implemented the public `effort` argument on generated `ask_<agent>` tools. Config-level `reasoningEffort` remains the default, while tool-call `effort` overrides it for one run.

## Changes

- `src/tools/sidekick.ts`
  - Added `effort` to `AskTaskSchema`.
  - Builds an effective per-call agent config by copying the configured agent and replacing `reasoningEffort` when `effort` is provided.
  - Passes the effective config into runner execution, so existing runner mappings apply:
    - Claude: `--effort <value>`
    - Codex: `--config model_reasoning_effort=...`
    - OpenCode: `--variant <value>`
    - Gemini: no automatic injection.
  - Returns effective `effort` in ask results when set.
  - Updated setup/list_agents guidance.
- `tests/serverApp.test.ts`
  - Added MCP integration coverage for `ask_claude` with `effort: "xhigh"`, asserting result metadata and CLI args.
- `tests/tools/initTools.test.ts`
  - Asserts tool definitions expose `effort` in input schema.
- `README.md`
  - Documents config `reasoningEffort` as default and tool-call `effort` as one-off override.
- `tasks/lessons.md`
  - Captured the correction that tool-side exposure must be implemented in the public schema, not only config.
- `tasks/todo.md`
  - Added Ask Tool Effort Override review/results.

## Verification

- `npm test -- tests/serverApp.test.ts tests/tools/initTools.test.ts`
- `npm run lint`
- `npm test` (14 files / 118 tests)
- `npm run build`
- `npm run test:e2e`
- `git diff --check`

All passed.
