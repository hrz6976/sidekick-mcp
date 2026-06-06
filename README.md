# Sidekick MCP

Sidekick is a task-based MCP server and local `sidekick` command for asking configured coding agents to help. It can run Claude, Gemini, Codex, and OpenCode as side agents while keeping task metadata, logs, and optional worktrees under `~/.sidekick`.

For MCP clients, the config file controls the public tool surface:

- each configured agent becomes an `ask_<name>` tool, such as `ask_gemini`, `ask_deepseek`, or `ask_kimi`
- `setup` is always available and returns an interactive configuration prompt with local runner/model discovery
- `list_agents` reports configured agents, runners, installation status, defaults, and models or aliases
- `cleanup_worktree` removes Sidekick-managed worktrees recorded in task metadata
- when no valid config exists, call `setup` first; management tools remain visible

For scripts and skills, the package also exposes a standalone `sidekick` CLI with MCP-free primitives: `setup`, `list`, `run`, and `cleanup`.

## Install

You can run Sidekick directly with `npx`; global installation is optional.

```bash
npm install -g @hrz6976/sidekick-mcp
```

MCP stdio command:

```bash
sidekick-mcp
```

Standalone CLI command:

```bash
sidekick
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

After adding the server, call `setup` from the client. Sidekick will inspect local Claude, Gemini, Codex, and OpenCode availability and return a prompt that asks you to choose a helper-agent configuration before creating or updating `~/.sidekick/config.json`.

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

## Standalone `sidekick` CLI

The standalone command is intended for local scripts and Codex skills such as `ensemble`. It uses the same `~/.sidekick/config.json` as the MCP server, but does not require an MCP client.

```bash
sidekick setup --json
sidekick list --json
sidekick run --agent gemini --prompt-file TASK.md --cwd . --mode read-only --worktree off --json
sidekick cleanup --task-id sidekick-... --force --json
```

`sidekick run` also accepts `--prompt <text>` for ad hoc use, but `--prompt-file` is the safer choice for skill and script dispatch. If `--cwd` is omitted, Sidekick uses the current working directory.

In human mode, `sidekick run` writes only the final answer to stdout. Progress goes to stderr. If a non-JSON run fails, stdout starts with:

```text
!!! ERROR OCCURRED !!!
```

With `--json`, stdout is a structured result containing `taskId`, `status`, `agent`, `runner`, `model`, `mode`, `worktree`, `logs`, `answer`, and optional `stats`.

`sidekick run` has no default command timeout. It lets the underlying runner finish unless the parent process or caller terminates it.

### Experimental Trajectory Export

`sidekick run` can export an experimental ATIF v1.7 trajectory:

```bash
sidekick run --agent gemini --prompt-file TASK.md --json --trajectory
sidekick run --agent gemini --prompt-file TASK.md --json --trajectory ./trajectory.json
sidekick run --agent gemini --prompt-file TASK.md --json --trajectory=./trajectory.json
```

When `--trajectory` is present without a path, Sidekick writes `trajectory.json` into the task directory under `~/.sidekick/tasks/<taskId>/`. Explicit relative paths resolve against `--cwd`. JSON results include `logs.trajectory` when export is requested.

Trajectory export records the prompt, best-effort runner steps parsed from stdout JSONL, final answer or error, Sidekick metadata, and final metrics when available. The runner-specific parsing lives with the Claude, Gemini, Codex, and OpenCode runner implementations.

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
      "effort": "high",
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

Each key under `agents` becomes a tool named `ask_<key>`. The `runner` field selects the underlying CLI: `claude`, `gemini`, `codex`, or `opencode`. Keep model/provider ids in `model`; use config `effort` for default effort levels and `extraArgs` for other advanced CLI options such as thinking budget, approval behavior, or provider-specific flags. Existing configs that still use `reasoningEffort` are accepted as a legacy alias, but new configs should use `effort`.

For Claude and Gemini, use CLI aliases unless you intentionally need a full model name. Claude aliases are `sonnet`, `opus`, and `haiku`; Gemini aliases are `auto`, `pro`, `flash`, and `flash-lite`. For OpenCode, avoid `opencode/` models as defaults; choose a real provider-prefixed model such as `deepseek/...`, `moonshot/...`, or `github-copilot/...`.

Ask tools also accept an `effort` argument for one-off overrides, for example `{ "prompt": "review this diff", "mode": "read-only", "effort": "high" }`. Effective effort maps to Claude `--effort` (`low`, `medium`, `high`), Codex `--config model_reasoning_effort=...` (`minimal`, `low`, `medium`, `high`), and OpenCode `--variant` with a simple variant name. Gemini CLI does not currently expose a direct headless reasoning-effort flag, so Gemini agents reject `effort`; use Gemini settings or `extraArgs` for provider-specific thinking configuration.

Ask tools also accept an optional `trajectory` argument for debug-only ATIF export. Use `true` to write `trajectory.json` in the Sidekick task directory, or pass a string path to write there. This is intended for debugging traces, not normal helper-agent asks.

Gemini gets `--skip-trust` by default from Sidekick, so it does not need to be repeated in config.

`setup` is always exposed. Use it after installing or removing CLIs, changing provider credentials, or wanting the calling agent to rewrite `~/.sidekick/config.json`. It returns current runner availability, configured agents, local model output or aliases, and a prompt that tells the calling agent to ask you which configuration to write. When the config file is missing or invalid, `setup`, `list_agents`, and `cleanup_worktree` remain visible; call `setup` first.

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

Codex models come from local `codex debug models --bundled`. OpenCode models come from local `opencode models`; Sidekick does not call `opencode models --refresh`. Gemini and Claude entries are CLI aliases, not account-entitled model lists.

## Development

```bash
npm run lint
npm test
npm run build
npm run test:sidekick:e2e
npm run test:mcp:e2e
```

Runtime requirements: Node.js 20 or newer.
