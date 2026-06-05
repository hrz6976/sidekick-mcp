# TESTS.md - Sidekick MCP Verification Suite

Automated tests cover the Sidekick MCP contract:

- missing-config mode exposes `setup`, `list_agents`, and `cleanup_worktree`
- configured mode exposes always-on `setup`, config-generated `ask_<agent>` tools, `list_agents`, and `cleanup_worktree`
- `ask_<agent>` tools support MCP Tasks and ordinary direct calls
- provider-specific progress rendering for Claude, Gemini, Codex, and OpenCode JSONL events
- runner command construction for Claude, Gemini, Codex, and OpenCode
- built-server fake CLI E2E for Claude, Gemini, Codex, and OpenCode
- task metadata, logs, interruption handling, and cleanup guards

Run:

```bash
npm run lint
npm test
npm run test:e2e
npm run build
```

Real model smoke tests are intentionally separate because they consume logged-in CLI/model quota:

```bash
npm run test:e2e:real:all
```
