import type { SidekickConfig } from '../config.js';
import type { ToolExecutionContext } from '../execution.js';
import type { CliAvailability } from '../utils/cliDetector.js';
import { askToolName, safeListModels, uniqueStrings } from './common.js';

export async function listSidekickAgents(
  config: SidekickConfig,
  availability: CliAvailability,
  context?: ToolExecutionContext,
): Promise<unknown> {
  if (!config.userConfig) {
    return {
      configStatus: config.configError ? 'invalid' : 'missing',
      configPath: config.configPath,
      configError: config.configError,
      agents: [],
      guidance: [
        'Call setup to generate interactive configuration guidance.',
        'After setup writes config.json, configured agents can be called by name with sidekick run or through ask_<agent> MCP tools.',
      ],
    };
  }

  const userConfig = config.userConfig;
  const agents = await Promise.all(Object.entries(userConfig.agents).map(async ([agentName, agentConfig]) => {
    const models = agentConfig.enabled
      ? await safeListModels(agentConfig, context)
      : [];
    return {
      agent: agentName,
      tool: askToolName(agentName),
      runner: agentConfig.runner,
      installed: availability[agentConfig.runner],
      enabled: agentConfig.enabled,
      command: agentConfig.command,
      model: agentConfig.model,
      effort: agentConfig.effort,
      extraArgs: agentConfig.extraArgs,
      description: agentConfig.description,
      configuredModels: uniqueStrings(agentConfig.models ?? []),
      models,
    };
  }));

  return {
    defaults: userConfig.defaults,
    agents,
    guidance: [
      'Use sidekick run --agent <agent> or the matching ask_<agent> MCP tool.',
      'Use `effort` in config for default effort controls, or pass `effort` at run time to override it for one run.',
      'Use mode "read-only" for analysis. Read-only calls default to worktree "off".',
      'Use mode "edit" or "full-access" with worktree "auto" for implementation to avoid concurrent edits.',
      'Codex models come from local `codex debug models --bundled`; OpenCode models come from local `opencode models` without `--refresh`; Antigravity models come from local `agy models`.',
      'Legacy Gemini and Claude models are CLI aliases, not account-entitled model lists.',
    ],
  };
}
