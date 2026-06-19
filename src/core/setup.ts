import type { AgentConfig, SidekickConfig, SidekickMode, WorktreeMode } from '../config.js';
import type { ToolExecutionContext } from '../execution.js';
import { getRunner, getRunnerAdapters } from '../runners/registry.js';
import type { CliAvailability } from '../utils/cliDetector.js';
import { askToolName, jsonText, safeListModels, uniqueStrings } from './common.js';

export interface RunnerDiscovery {
  runner: AgentConfig['runner'];
  command: string;
  installed: boolean;
  models: string[];
  modelDiscovery: string;
}

export interface ConfiguredAgentSummary {
  agent: string;
  tool: string;
  runner: AgentConfig['runner'];
  command: string;
  installed: boolean;
  enabled: boolean;
  model?: string;
  effort?: string;
  extraArgs: string[];
  configuredModels: string[];
  description?: string;
  models?: string[];
}

export interface SidekickSetupState {
  configPath: string;
  sidekickHome: string;
  configStatus: 'missing' | 'invalid' | 'loaded';
  configError?: string;
  defaults?: {
    mode: SidekickMode;
    worktree: WorktreeMode;
  };
  configuredAgents: ConfiguredAgentSummary[];
  runnerDiscovery: RunnerDiscovery[];
  recommendedConfigTemplate: unknown;
}

function defaultAgentConfig(runner: AgentConfig['runner'], enabled: boolean): AgentConfig {
  const adapter = getRunner(runner);
  return {
    runner,
    enabled,
    command: adapter.defaultCommand,
    extraArgs: [],
  };
}

export function buildRecommendedConfig(discovery: Array<{
  runner: AgentConfig['runner'];
  installed: boolean;
  models: string[];
}>): unknown {
  const agents: Record<string, unknown> = {};

  for (const entry of discovery) {
    if (!entry.installed) {
      continue;
    }
    Object.assign(agents, getRunner(entry.runner).recommendedAgents(entry.models));
  }

  if (Object.keys(agents).length === 0) {
    for (const adapter of getRunnerAdapters()) {
      if (adapter.fallbackRecommendationModels.length === 0) {
        continue;
      }
      Object.assign(agents, adapter.recommendedAgents(adapter.fallbackRecommendationModels));
    }
  }

  return {
    agents,
    defaults: { mode: 'edit', worktree: 'auto' },
  };
}

function modelRefFor(
  runner: AgentConfig['runner'],
  model: string,
  discovery: Array<{ runner: AgentConfig['runner']; models: string[] }>,
): string | undefined {
  const runnerDiscovery = discovery.find((entry) => entry.runner === runner);
  const index = runnerDiscovery?.models.indexOf(model) ?? -1;
  return index >= 0 ? `runnerDiscovery.${runner}.models[${index}]` : undefined;
}

export function buildRecommendedConfigTemplate(discovery: Array<{
  runner: AgentConfig['runner'];
  installed: boolean;
  models: string[];
}>): unknown {
  const config = buildRecommendedConfig(discovery);
  if (!config || typeof config !== 'object') {
    return config;
  }

  const record = config as Record<string, unknown>;
  const agents = record.agents;
  if (!agents || typeof agents !== 'object') {
    return config;
  }

  return {
    ...record,
    agents: Object.fromEntries(Object.entries(agents as Record<string, unknown>).map(([agent, rawConfig]) => {
      if (!rawConfig || typeof rawConfig !== 'object') {
        return [agent, rawConfig];
      }
      const agentRecord = { ...(rawConfig as Record<string, unknown>) };
      const runner = agentRecord.runner;
      const model = agentRecord.model;
      if (typeof runner === 'string' && typeof model === 'string') {
        const ref = modelRefFor(runner as AgentConfig['runner'], model, discovery);
        if (ref) {
          delete agentRecord.model;
          agentRecord.modelRef = ref;
        }
      }
      return [agent, agentRecord];
    })),
  };
}

export async function getSetupState(
  config: SidekickConfig,
  availability: CliAvailability,
  context?: ToolExecutionContext,
): Promise<SidekickSetupState> {
  const runnerDiscovery = await Promise.all(getRunnerAdapters().map(async (adapter) => {
    const runner = adapter.name;
    const installed = availability[runner];
    const probeConfig = defaultAgentConfig(runner, installed);
    const models = installed ? await safeListModels(probeConfig, context) : [];
    return {
      runner,
      command: adapter.defaultCommand,
      installed,
      models,
      modelDiscovery: installed
        ? adapter.modelDiscoveryDescription
        : 'CLI not found on PATH',
    };
  }));

  const configuredAgents = config.userConfig
    ? Object.entries(config.userConfig.agents).map(([agent, agentConfig]) => ({
        agent,
        tool: askToolName(agent),
        runner: agentConfig.runner,
        command: agentConfig.command,
        installed: availability[agentConfig.runner],
        enabled: agentConfig.enabled,
        model: agentConfig.model,
        effort: agentConfig.effort,
        extraArgs: agentConfig.extraArgs,
        description: agentConfig.description,
        configuredModels: uniqueStrings(agentConfig.models ?? []),
      }))
    : [];

  return {
    configPath: config.configPath,
    sidekickHome: config.sidekickHome,
    configStatus: config.configError
      ? 'invalid'
      : config.userConfig
        ? 'loaded'
        : 'missing',
    configError: config.configError,
    defaults: config.userConfig?.defaults,
    configuredAgents,
    runnerDiscovery,
    recommendedConfigTemplate: buildRecommendedConfigTemplate(runnerDiscovery),
  };
}

export function formatSetupPrompt(state: SidekickSetupState): string {
  return [
    state.configError
      ? `Config problem: ${state.configError}`
      : state.configStatus === 'loaded'
        ? 'Sidekick is already configured. Use this setup prompt to review or update the configuration.'
        : 'Sidekick has not been configured yet.',
    '',
    'Current Sidekick discovery:',
    jsonText({
      configPath: state.configPath,
      sidekickHome: state.sidekickHome,
      configStatus: state.configStatus,
      configError: state.configError,
      defaults: state.defaults,
      configuredAgents: state.configuredAgents,
      runnerDiscovery: state.runnerDiscovery,
    }),
    '',
    'Setup prompt for the current agent:',
    '1. Read the discovery data above before editing config. Treat `models` as local CLI output or aliases, not as verified account entitlements.',
    '2. Before writing config, propose 2-4 concise configuration choices to the user and ask which they prefer. Use AskUserQuestion when available; otherwise ask in normal chat.',
    '3. Good choices usually include a fast review helper, a stronger implementation helper, Google Antigravity if `agy` is installed, and any provider-specific OpenCode helpers found locally.',
    '4. If the config is missing, create it. If it is loaded, patch it instead of overwriting unrelated existing agents.',
    '5. Each key in `agents` becomes an MCP tool named `ask_<key>` and a sidekick agent name. Use memorable aliases such as antigravity, gemini, claude, codex, deepseek, or kimi.',
    '6. For each helper, set `runner` to one of claude, gemini, antigravity, codex, or opencode. Use `model` for the model/provider id; do not put model flags in `extraArgs`.',
    '7. For Claude and legacy Gemini, prefer CLI aliases unless the user explicitly asks for a full model name: Claude aliases are sonnet, opus, haiku; Gemini aliases are auto, pro, flash, flash-lite. For Google Antigravity, use model ids from `agy models` or omit `model` to use the CLI default.',
    '8. For OpenCode, do not choose models starting with `opencode/` by default; prefer real provider-prefixed models such as deepseek/..., moonshot/..., github-copilot/..., or another user-selected provider model.',
    '9. Use config `effort` for default effort controls. Ask tools and sidekick CLI also accept an `effort` override for one call.',
    '10. Sidekick maps effort to Claude `--effort` (`low`, `medium`, `high`), Codex `--config model_reasoning_effort=...` (`minimal`, `low`, `medium`, `high`), and OpenCode `--variant` (simple variant name). Gemini CLI and Antigravity CLI do not expose a direct headless reasoning-effort flag, so effort overrides are rejected for those agents.',
    '11. Use `extraArgs` for other advanced CLI/model options such as thinking budgets, provider-specific flags, or approval tuning.',
    '12. Gemini automatically gets `--skip-trust` from Sidekick. Antigravity read-only mode gets `--sandbox`, and full-access mode gets `--dangerously-skip-permissions`. Only add `extraArgs` for behavior beyond those defaults.',
    '13. MCP ask tools run in the MCP client project root when roots are available; sidekick CLI uses `--cwd` or its launch directory.',
    '14. Read-only investigations usually use `mode: "read-only"` and omit worktree to avoid creating a worktree.',
    '15. For edit or full-access tasks, prefer `worktree: "auto"` so helper agents work in an isolated worktree and avoid concurrent edits to the main checkout.',
    '16. Codex models come from local `codex debug models --bundled`; OpenCode models come from local `opencode models`; Antigravity models come from local `agy models`. Legacy Gemini and Claude entries are aliases only.',
    '17. Create or update the Sidekick home directory and config file:',
    `   mkdir -p ${state.sidekickHome}`,
    `   write JSON to ${state.configPath}`,
    '18. Use this recommended starter config template as a base only after the user chooses a configuration direction. Replace any `modelRef` with the referenced model from discovery before writing config.',
    '',
    jsonText(state.recommendedConfigTemplate),
  ].join('\n');
}
