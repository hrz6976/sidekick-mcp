#!/usr/bin/env bash
set -euo pipefail

PACKAGE="@hrz6976/sidekick-mcp@latest"
SERVER_NAME="Sidekick"

echo "Installing Sidekick MCP..."

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required." >&2
  exit 1
fi

if command -v claude >/dev/null 2>&1; then
  claude mcp remove --scope user "$SERVER_NAME" >/dev/null 2>&1 || true
  claude mcp add --scope user "$SERVER_NAME" -- npx -y "$PACKAGE"
  echo "Configured Claude Code MCP server: $SERVER_NAME"
fi

mkdir -p "$HOME/.sidekick"

cat <<'EOF'

Sidekick MCP installed.

Next steps:
1. Start your MCP client and call setup.
2. Use the returned prompt to create ~/.sidekick/config.json.
3. Call list_agents to verify configured agents, then use ask_<agent> tools.

Manual MCP command:
  npx -y @hrz6976/sidekick-mcp@latest
EOF
