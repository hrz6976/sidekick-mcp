# @hrz6976/sidekick-mcp

## 1.5.40

### Breaking Changes

- Reworked the project as Sidekick MCP.
- Renamed the npm package to `@hrz6976/sidekick-mcp`.
- Renamed the binary to `sidekick-mcp`.
- Replaced the old per-agent tool surface with config-generated `ask_<agent>` tools plus always-on `setup`, `list_agents`, and `cleanup_worktree`.
- Moved config and runtime files to `~/.sidekick`.
- Replaced legacy environment names with `SIDEKICK_*`.
