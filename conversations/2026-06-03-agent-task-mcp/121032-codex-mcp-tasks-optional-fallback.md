# Handoff: MCP Tasks Optional Fallback

## Context

User suspected Sidekick's hand-written MCP Tasks support was wrong after Claude Code returned:

`Tool "ask_gemini" must be called through MCP Tasks. Re-call it with task augmentation enabled.`

## Findings

- MCP Tasks are an experimental extension negotiated by client/server capabilities.
- The TypeScript SDK exposes per-tool `execution.taskSupport` as `forbidden`, `optional`, or `required`.
- SDK task-aware clients use `client.experimental.tasks.callToolStream(...)` and send task creation params on `params.task`.
- The SDK simple task example also checks `params._meta.task`, so Sidekick now accepts both locations.
- Real Claude Code 2.1.162 still invoked `ask_gemini` through ordinary `tools/call`; Sidekick logs showed `task:false` and a progress token.
- Therefore `taskSupport: "required"` is not compatible with Claude Code's current model-turn MCP tool path.

## Changes

- `src/serverApp.ts`
  - Added task creation param extraction from `params.task` or `_meta.task`.
- `src/tools/sidekick.ts`
  - Changed generated `ask_<agent>` tools to `taskSupport: "optional"`.
  - Removed the no-task rejection inside ask tool execution.
  - Generates a Sidekick task id for ordinary direct calls and still writes task metadata/logs.
- Tests/docs
  - Updated tests to expect optional task support.
  - Added direct `ask_claude` call coverage.
  - Kept task-stream coverage.
  - Updated README and `tests/TESTS.md`.
- Task notes
  - Added MCP Tasks compatibility pass to `tasks/todo.md`.
  - Added lesson about not assuming Claude Code uses task augmentation.

## Verification

- `npm test -- tests/serverApp.test.ts tests/tools/initTools.test.ts`
- `npm run lint`
- `npm test` passed: 12 files / 99 tests
- `npm run test:e2e`
- `npm run build`
- `git diff --check`
- Real Claude Code probe:
  - Command entered Sidekick successfully through ordinary `tools/call`.
  - Sidekick spawned Gemini.
  - Failure moved to provider/model layer: configured `gemini-3.1-pro` returned `ModelNotFoundError: Requested entity was not found`.

## Remaining Notes

- If the user wants a successful real Gemini probe, update `~/.sidekick/config.json` to a valid Gemini model such as the current CLI default or another model available to the account, then rerun the Claude probe.
- The generic server-side rejection for tools with `taskSupport: "required"` remains for future tools that are truly task-only.
