# Sidekick MCP

Sidekick is a task-based MCP server for asking configured local coding agents to help. The config file controls the public tool surface:

- each configured agent becomes an `ask_<name>` tool, such as `ask_gemini`, `ask_deepseek`, or `ask_kimi`
- `setup` is always available and returns a reconfiguration prompt with local runner/model discovery
- `list_agents` reports configured agents, runners, installation status, defaults, and model hints
- `cleanup_worktree` removes Sidekick-managed worktrees recorded in task metadata
- when no valid config exists, `setup` is the only exposed tool

## Install

You can run Sidekick directly with `npx`; global installation is optional.

```bash
npm install -g @hrz6976/sidekick-mcp
```

MCP stdio command:

```bash
sidekick-mcp
```

Equivalent npx command:

```bash
npx -y @hrz6976/sidekick-mcp@latest
```

## MCP Client Setup

Use the same stdio command everywhere:

```bash
npx -y @hrz6976/sidekick-mcp@latest
```

After adding the server, call `setup` from the client. Sidekick will inspect local Claude, Gemini, Codex, and OpenCode availability and return a prompt for creating or updating `~/.sidekick/config.json`.

Some clients namespace tools by MCP server name, so `setup` may appear as `sidekick_setup`, `ask_gemini` as `sidekick_ask_gemini`, and so on.

### Claude Code

```bash
claude mcp add --scope user sidekick -- npx -y @hrz6976/sidekick-mcp@latest
claude mcp list
```

Use `--scope project` instead of `--scope user` if you want the server only for the current repository.

### Gemini CLI

```bash
gemini mcp add --scope user sidekick npx -y @hrz6976/sidekick-mcp@latest
gemini mcp list
```

Gemini CLI defaults `mcp add` to project scope, so pass `--scope user` when you want Sidekick available across repositories. If you want Gemini to skip tool-call confirmation for this trusted local server, add `--trust`.

### Codex CLI

```bash
codex mcp add sidekick -- npx -y @hrz6976/sidekick-mcp@latest
codex mcp list
```

Manual equivalent in `~/.codex/config.toml`:

```toml
[mcp_servers.sidekick]
command = "npx"
args = ["-y", "@hrz6976/sidekick-mcp@latest"]
startup_timeout_sec = 20
tool_timeout_sec = 300
```

### OpenCode

OpenCode's `opencode mcp add` flow is interactive. For a reproducible setup, merge this into `~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "sidekick": {
      "type": "local",
      "command": ["npx", "-y", "@hrz6976/sidekick-mcp@latest"],
      "enabled": true,
      "timeout": 300000
    }
  }
}
```

Then run:

```bash
opencode mcp list
```

## Configure

Sidekick reads JSON config from `~/.sidekick/config.json` by default. Override it with `SIDEKICK_CONFIG_PATH`.

```json
{
  "agents": {
    "gemini": {
      "runner": "gemini",
      "model": "auto",
      "extraArgs": [],
      "description": "Ask Gemini for broad reasoning and implementation review."
    },
    "deepseek": {
      "runner": "opencode",
      "model": "deepseek/deepseek-chat",
      "reasoningEffort": "high",
      "extraArgs": [],
      "description": "Ask DeepSeek through OpenCode with high reasoning effort."
    },
    "kimi": {
      "runner": "opencode",
      "model": "moonshot/kimi-k2",
      "extraArgs": [],
      "description": "Ask Kimi through OpenCode."
    }
  },
  "defaults": {
    "mode": "edit",
    "worktree": "auto"
  }
}
```

Each key under `agents` becomes a tool named `ask_<key>`. The `runner` field selects the underlying CLI: `claude`, `gemini`, `codex`, or `opencode`. Keep model/provider ids in `model`; use config `reasoningEffort` for default effort levels and `extraArgs` for other advanced CLI options such as thinking budget, approval behavior, or provider-specific flags.

Ask tools also accept an `effort` argument for one-off overrides, for example `{ "prompt": "review this diff", "mode": "read-only", "effort": "high" }`. Effective effort maps to Claude `--effort`, Codex `--config model_reasoning_effort=...`, and OpenCode `--variant`. Gemini CLI does not currently expose a direct headless reasoning-effort flag; use Gemini settings or `extraArgs` for provider-specific thinking configuration.

Gemini gets `--skip-trust` by default from Sidekick, so it does not need to be repeated in config.

`setup` is always exposed. Use it after installing or removing CLIs, changing provider credentials, or wanting the calling agent to rewrite `~/.sidekick/config.json`. It returns current runner availability, configured agents, model hints, and a prompt that tells the calling agent how to create or patch the config. When the config file is missing or invalid, Sidekick starts in setup-only mode and exposes only `setup`.

## Worktrees And Tasks

`ask_<name>` tools support MCP Tasks when the client calls them with task augmentation. They also accept ordinary `tools/call` requests for clients that do not yet route MCP tools through Tasks; in that mode the call runs synchronously while still writing Sidekick task metadata and logs.

When the MCP client provides a progress token, Sidekick translates Claude, Gemini, Codex, and OpenCode JSONL events into short human-readable progress messages. `ask_<name>` results return a clean `answer` plus task metadata; raw CLI stdout is preserved in task logs instead of being dumped into the tool response.

Default mode is `edit`. Use `mode: "read-only"` for inspection-only work or `mode: "full-access"` only when explicitly intended.

Worktree behavior:

- Read-only calls default to `worktree: "off"` and usually do not need a separate worktree.
- Edit and full-access calls should use `worktree: "auto"` to avoid concurrent helper edits in the main checkout.
- Claude and Gemini use native CLI worktree support.
- Codex and OpenCode use Sidekick-managed git worktrees under `~/.sidekick/worktrees`.
- Task metadata and logs are written under `~/.sidekick/tasks/<taskId>/`.
- Worktrees are retained by default. Call `cleanup_worktree` after inspecting or merging results.

Codex model hints come from local `codex debug models --bundled`. OpenCode model hints come from local `opencode models`; Sidekick does not call `opencode models --refresh`. Gemini and Claude model hints use Sidekick's built-in CLI aliases/candidates.

## Development

```bash
npm run lint
npm test
npm run test:e2e
npm run build
```

Runtime requirements: Node.js 20 or newer.
