import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { AgentConfig, SidekickConfig, SidekickMode, WorktreeMode } from '../config.js';
import type { ToolExecutionContext } from '../execution.js';
import { extractRunOutput } from '../runners/output.js';
import { createCliProgressRenderer } from '../runners/progress.js';
import { getRunner } from '../runners/registry.js';
import { TaskMetadataStore } from '../tasks/metadataStore.js';
import type { CliAvailability } from '../utils/cliDetector.js';
import { cleanupWorktree, createWorktree } from '../worktrees/manager.js';
import type { UnifiedTool } from './registry.js';

const RUNNER_NAMES = ['claude', 'gemini', 'codex', 'opencode'] as const;
const ModeSchema = z.enum(['read-only', 'edit', 'full-access']);
const WorktreeSchema = z.enum(['auto', 'off']);
const AskTaskSchema = z.object({
  prompt: z.string().min(1),
  mode: ModeSchema.optional(),
  worktree: WorktreeSchema.optional(),
  effort: z.string().trim().min(1).optional(),
  title: z.string().min(1).optional(),
});
const CleanupSchema = z.object({
  taskId: z.string().min(1).optional(),
  worktreeId: z.string().min(1).optional(),
  force: z.boolean().optional(),
});

function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function ensureConfigured(config: SidekickConfig) {
  if (!config.userConfig) {
    throw new Error(
      `Sidekick is not configured. Call setup and create ${config.configPath}.`,
    );
  }
  return config.userConfig;
}

function resolveMode(config: SidekickConfig, mode?: SidekickMode): SidekickMode {
  return mode ?? ensureConfigured(config).defaults.mode ?? 'edit';
}

function resolveWorktree(
  config: SidekickConfig,
  mode: SidekickMode,
  worktree?: WorktreeMode,
): WorktreeMode {
  if (worktree) {
    return worktree;
  }
  if (mode === 'read-only') {
    return 'off';
  }
  return ensureConfigured(config).defaults.worktree ?? 'auto';
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return values.filter((value, index): value is string =>
    Boolean(value) && values.indexOf(value) === index,
  );
}

function defaultAgentConfig(runner: AgentConfig['runner'], enabled: boolean): AgentConfig {
  return {
    runner,
    enabled,
    command: runner,
    extraArgs: [],
  };
}

async function safeListModels(
  agentConfig: AgentConfig,
  context?: ToolExecutionContext,
): Promise<string[]> {
  try {
    return await getRunner(agentConfig.runner).listModels(agentConfig, context);
  } catch {
    return agentConfig.models ?? [];
  }
}

function firstModel(models: string[]): string | undefined {
  return models.find((model) => model.trim());
}

function preferOpenCodeModel(models: string[], pattern?: RegExp): string | undefined {
  return models.find((model) =>
    !model.startsWith('opencode/') && (!pattern || pattern.test(model)),
  );
}

function modelDiscoveryDescription(runner: AgentConfig['runner']): string {
  switch (runner) {
    case 'codex':
      return '`codex debug models --bundled` local bundled catalog parsing; falls back to Sidekick built-in Codex hints';
    case 'opencode':
      return '`opencode models` local provider-layer parsing; Sidekick never uses `--refresh` by default';
    case 'gemini':
      return 'Gemini CLI aliases only (`auto`, `pro`, `flash`, `flash-lite`); Gemini CLI has no headless model-list command';
    case 'claude':
      return 'Claude Code aliases only (`sonnet`, `opus`, `haiku`) plus any full model name the user chooses; Claude CLI has no headless model-list command';
  }
}

function buildRecommendedConfig(discovery: Array<{
  runner: AgentConfig['runner'];
  installed: boolean;
  models: string[];
}>): unknown {
  const agents: Record<string, unknown> = {};

  const byRunner = Object.fromEntries(discovery.map((entry) => [entry.runner, entry]));
  const gemini = byRunner.gemini;
  if (gemini?.installed) {
    agents.gemini = {
      runner: 'gemini',
      ...(firstModel(gemini.models) ? { model: firstModel(gemini.models) } : {}),
      extraArgs: [],
      description: 'Ask Gemini for broad reasoning and implementation review.',
    };
  }

  const claude = byRunner.claude;
  if (claude?.installed) {
    agents.claude = {
      runner: 'claude',
      ...(firstModel(claude.models) ? { model: firstModel(claude.models) } : {}),
      extraArgs: [],
      description: 'Ask Claude for implementation and code review.',
    };
  }

  const codex = byRunner.codex;
  if (codex?.installed) {
    agents.codex = {
      runner: 'codex',
      ...(firstModel(codex.models) ? { model: firstModel(codex.models) } : {}),
      extraArgs: [],
      description: 'Ask Codex for coding tasks and repository changes.',
    };
  }

  const opencode = byRunner.opencode;
  if (opencode?.installed) {
    const deepseek = preferOpenCodeModel(opencode.models, /deepseek/i);
    const kimi = preferOpenCodeModel(opencode.models, /kimi|moonshot/i);
    if (deepseek) {
      agents.deepseek = {
        runner: 'opencode',
        model: deepseek,
        reasoningEffort: 'high',
        extraArgs: [],
        description: 'Ask DeepSeek through OpenCode with high reasoning effort.',
      };
    }
    if (kimi) {
      agents.kimi = {
        runner: 'opencode',
        model: kimi,
        extraArgs: [],
        description: 'Ask Kimi through OpenCode.',
      };
    }
    if (!deepseek && !kimi) {
      const preferred = preferOpenCodeModel(opencode.models);
      agents.opencode = {
        runner: 'opencode',
        ...(preferred ? { model: preferred } : {}),
        extraArgs: [],
        description: 'Ask a configured OpenCode provider/model.',
      };
    }
  }

  if (Object.keys(agents).length === 0) {
    agents.gemini = {
      runner: 'gemini',
      model: 'auto',
      extraArgs: [],
      description: 'Ask Gemini for broad reasoning and implementation review.',
    };
    agents.deepseek = {
      runner: 'opencode',
      model: 'deepseek/deepseek-chat',
      reasoningEffort: 'high',
      extraArgs: [],
      description: 'Ask DeepSeek through OpenCode with high reasoning effort.',
    };
  }

  return {
    agents,
    defaults: { mode: 'edit', worktree: 'auto' },
  };
}

async function setupPrompt(
  config: SidekickConfig,
  availability: CliAvailability,
  context?: ToolExecutionContext,
): Promise<string> {
  const runnerDiscovery = await Promise.all(RUNNER_NAMES.map(async (runner) => {
    const installed = availability[runner];
    const probeConfig = defaultAgentConfig(runner, installed);
    const models = installed ? await safeListModels(probeConfig, context) : [];
    return {
      runner,
      command: runner,
      installed,
      models,
      modelDiscovery: installed
        ? modelDiscoveryDescription(runner)
        : 'CLI not found on PATH',
    };
  }));

  const configuredAgents = config.userConfig
    ? await Promise.all(Object.entries(config.userConfig.agents).map(async ([agent, agentConfig]) => ({
        agent,
        tool: askToolName(agent),
        runner: agentConfig.runner,
        command: agentConfig.command,
        installed: availability[agentConfig.runner],
        enabled: agentConfig.enabled,
        model: agentConfig.model,
        reasoningEffort: agentConfig.reasoningEffort,
        extraArgs: agentConfig.extraArgs,
        configuredModels: uniqueStrings([...(agentConfig.models ?? []), agentConfig.model]),
      })))
    : [];

  const currentState = {
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
  };

  return [
    config.configError
      ? `Config problem: ${config.configError}`
      : config.userConfig
        ? 'Sidekick is already configured. Use this setup prompt to review or update the configuration.'
        : 'Sidekick MCP has not been configured yet.',
    '',
    'Current Sidekick discovery:',
    jsonText(currentState),
    '',
    'Setup prompt for the current agent:',
    '1. Read the discovery data above before editing config. Treat `models` as local CLI output or aliases, not as verified account entitlements.',
    '2. Before writing config, propose 2-4 concise configuration choices to the user and ask which they prefer. Use AskUserQuestion when available; otherwise ask in normal chat.',
    '3. Good choices usually include a fast review helper, a stronger implementation helper, and any provider-specific OpenCode helpers found locally.',
    '4. If the config is missing, create it. If it is loaded, patch it instead of overwriting unrelated existing agents.',
    '5. Each key in `agents` becomes an MCP tool named `ask_<key>`. Use memorable aliases such as gemini, claude, codex, deepseek, or kimi.',
    '6. For each helper, set `runner` to one of claude, gemini, codex, or opencode. Use `model` for the model/provider id; do not put model flags in `extraArgs`.',
    '7. For Claude and Gemini, prefer CLI aliases unless the user explicitly asks for a full model name: Claude aliases are sonnet, opus, haiku; Gemini aliases are auto, pro, flash, flash-lite.',
    '8. For OpenCode, do not choose models starting with `opencode/` by default; prefer real provider-prefixed models such as deepseek/..., moonshot/..., github-copilot/..., or another user-selected provider model.',
    '9. Use config `reasoningEffort` for default effort controls. Ask tools also accept an `effort` argument to override it for one call.',
    '10. Sidekick maps effort to Claude `--effort`, Codex `--config model_reasoning_effort=...`, and OpenCode `--variant`. Gemini CLI has no direct reasoning-effort flag.',
    '11. Use `extraArgs` for other advanced CLI/model options such as thinking budgets, provider-specific flags, or approval tuning.',
    '12. Gemini automatically gets `--skip-trust` from Sidekick. Only add Gemini `extraArgs` for extra behavior beyond that default.',
    '13. Ask tools run in the MCP client project root when the client supports roots; otherwise they use the MCP server launch directory.',
    '14. Read-only investigations usually do not need a worktree; call ask tools with `mode: "read-only"` and omit `worktree` to use the selected project directory without creating a worktree.',
    '15. For edit or full-access tasks, prefer `worktree: "auto"` so helper agents work in an isolated worktree and avoid concurrent edits to the main checkout.',
    '16. Codex models come from local `codex debug models --bundled`; OpenCode models come from local `opencode models`. Gemini and Claude entries are aliases only.',
    '17. Create or update the Sidekick home directory and config file:',
    `   mkdir -p ${config.sidekickHome}`,
    `   write JSON to ${config.configPath}`,
    '18. Use this recommended starter config as a base only after the user chooses a configuration direction:',
    '',
    jsonText(buildRecommendedConfig(runnerDiscovery)),
  ].join('\n');
}

function cleanupHint(taskId: string): string {
  return `When you are done inspecting or merging this worktree, call cleanup_worktree with taskId "${taskId}".`;
}

function askToolName(agentName: string): string {
  return `ask_${agentName}`;
}

function askToolDescription(agentName: string, agentConfig: AgentConfig): string {
  const target = agentConfig.model
    ? `${agentName} (${agentConfig.runner}, ${agentConfig.model})`
    : `${agentName} (${agentConfig.runner}, CLI default model)`;
  const custom = agentConfig.description ? `${agentConfig.description} ` : '';
  return [
    `${custom}Start a task-based helper-agent run with ${target}.`,
    'It runs in the MCP client project root when roots are available, or the MCP server launch directory otherwise.',
    'Use mode "read-only" for analysis; read-only calls default to worktree "off".',
    'For edit or full-access work, prefer worktree "auto" to avoid concurrent edits in the main checkout.',
    'Use effort to override this agent\'s configured reasoning effort for one call where the runner supports it.',
  ].join(' ');
}

function askPromptDescription(agentName: string): string {
  return [
    `Ask the configured ${agentName} helper agent to work on a task.`,
    'Sidekick uses the MCP client project root when roots are available, or the MCP server launch directory otherwise.',
    'Use read-only mode for investigation and review; it does not create a worktree unless worktree is explicitly set.',
    'Use edit/full-access mode with worktree auto for implementation work so concurrent helper edits stay isolated.',
    'Use the effort argument to override the configured reasoning effort for this one call where supported.',
  ].join(' ');
}

function createAskTool(
  config: SidekickConfig,
  metadataStore: TaskMetadataStore,
  agentName: string,
  agentConfig: AgentConfig,
): UnifiedTool {
  return {
    name: askToolName(agentName),
    description: askToolDescription(agentName, agentConfig),
    zodSchema: AskTaskSchema,
    category: agentConfig.runner,
    execution: { taskSupport: 'optional' },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    prompt: {
      description: askPromptDescription(agentName),
    },
    async execute(args, context?: ToolExecutionContext) {
      const parsed = AskTaskSchema.parse(args);
      const taskId = context?.taskId ?? randomUUID();
      const executionContext: ToolExecutionContext = { ...context, taskId };
      const mode = resolveMode(config, parsed.mode);
      const worktreeMode = resolveWorktree(config, mode, parsed.worktree);
      const effectiveAgentConfig = parsed.effort
        ? { ...agentConfig, reasoningEffort: parsed.effort }
        : agentConfig;
      const model = agentConfig.model ?? '';
      const baseCwd = executionContext.cwd ?? process.cwd();

      const worktree = await createWorktree({
        agent: agentConfig.runner,
        taskId,
        baseCwd,
        mode: worktreeMode,
        worktreeRootDir: config.worktreeRootDir,
        context: executionContext,
      });

      const metadata = await metadataStore.create({
        taskId,
        title: parsed.title,
        status: 'running',
        agent: agentName,
        runner: agentConfig.runner,
        model,
        mode,
        baseCwd,
        worktree,
      });

      const progressRenderer = createCliProgressRenderer(effectiveAgentConfig.runner);
      let capturedStdout = '';
      const progress = (chunk: string) => {
        capturedStdout += chunk;
        void metadataStore.appendStdout(taskId, chunk);
        for (const message of progressRenderer.onChunk(chunk)) {
          executionContext.onProgress?.(message);
        }
      };

      try {
        const runner = getRunner(effectiveAgentConfig.runner);
        const result = await runner.run({
          agent: effectiveAgentConfig.runner,
          model,
          prompt: parsed.prompt,
          mode,
          cwd: worktree.cwd,
          env: executionContext.env,
          agentConfig: effectiveAgentConfig,
          worktree,
          context: {
            ...executionContext,
            cwd: worktree.cwd,
            onProgress: progress,
          },
        });

        if (result.stdout && capturedStdout !== result.stdout) {
          const missingStdout = result.stdout.startsWith(capturedStdout)
            ? result.stdout.slice(capturedStdout.length)
            : `${capturedStdout ? '\n' : ''}${result.stdout}`;
          await metadataStore.appendStdout(taskId, missingStdout);
        }
        for (const message of progressRenderer.flush()) {
          executionContext.onProgress?.(message);
        }
        const extracted = extractRunOutput(effectiveAgentConfig.runner, result.stdout);
        await metadataStore.update(taskId, {
          status: 'completed',
          exitCode: result.exitCode,
        });

        const response = {
          taskId,
          status: 'completed',
          agent: agentName,
          runner: effectiveAgentConfig.runner,
          model: model || '(cli default)',
          ...(effectiveAgentConfig.reasoningEffort ? { effort: effectiveAgentConfig.reasoningEffort } : {}),
          mode,
          worktree,
          logs: {
            stdout: metadata.stdoutPath,
            stderr: metadata.stderrPath,
            result: metadata.resultPath,
          },
          cleanupHint: cleanupHint(taskId),
          answer: extracted.answer,
          ...(extracted.stats ? { stats: extracted.stats } : {}),
        };
        await metadataStore.writeResult(taskId, response);
        return jsonText(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await metadataStore.appendStderr(taskId, `${message}\n`);
        await metadataStore.update(taskId, {
          status: executionContext.signal?.aborted ? 'cancelled' : 'failed',
          error: message,
        });
        throw error;
      }
    },
  };
}

export function createSidekickTools(
  config: SidekickConfig,
  availability: CliAvailability,
): UnifiedTool[] {
  const metadataStore = new TaskMetadataStore(config.taskRootDir);

  const setupTool: UnifiedTool = {
    name: 'setup',
    description: config.userConfig
      ? 'Review or update Sidekick configuration. Returns an executable prompt that should ask the user to choose helper-agent settings before editing config.'
      : 'Sidekick is not configured yet. Call this tool first to generate an interactive setup prompt for creating Sidekick helper-agent configuration.',
    zodSchema: z.object({}),
    category: 'utility',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    prompt: {
      description: 'Configure or update Sidekick agents. Each configured agent becomes an ask_<name> tool.',
    },
    async execute(_args, context?: ToolExecutionContext) {
      return setupPrompt(config, availability, context);
    },
  };

  const askTools = config.userConfig ? Object.entries(config.userConfig.agents)
    .filter(([, agentConfig]) => agentConfig.enabled)
    .map(([agentName, agentConfig]) => createAskTool(
      config,
      metadataStore,
      agentName,
      agentConfig,
    )) : [];

  const listAgentsTool: UnifiedTool = {
    name: 'list_agents',
    description: config.userConfig
      ? 'List configured Sidekick helper agents, their runners, installation status, defaults, and configured models.'
      : 'Sidekick is not configured yet. Call setup first; this tool reports the missing configuration state.',
    zodSchema: z.object({}),
    category: 'utility',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async execute(_args, context?: ToolExecutionContext) {
      if (!config.userConfig) {
        return jsonText({
          configStatus: config.configError ? 'invalid' : 'missing',
          configPath: config.configPath,
          configError: config.configError,
          agents: [],
          guidance: [
            'Call setup to generate an interactive configuration prompt.',
            'After setup writes config.json and the MCP server restarts or reloads, configured ask_<agent> tools will appear.',
          ],
        });
      }

      const userConfig = config.userConfig;
      const agents = await Promise.all(Object.entries(userConfig.agents).map(async ([agentName, agentConfig]) => {
        const models = agentConfig.enabled
          ? await getRunner(agentConfig.runner).listModels(agentConfig, context)
          : [];
        return {
          agent: agentName,
          tool: askToolName(agentName),
          runner: agentConfig.runner,
          installed: availability[agentConfig.runner],
          enabled: agentConfig.enabled,
          command: agentConfig.command,
          model: agentConfig.model,
          reasoningEffort: agentConfig.reasoningEffort,
          extraArgs: agentConfig.extraArgs,
          description: agentConfig.description,
          configuredModels: uniqueStrings([...(agentConfig.models ?? []), agentConfig.model]),
          models,
        };
      }));

      return jsonText({
        defaults: userConfig.defaults,
        agents,
        guidance: [
          'Use ask_<agent> tools directly; the tool name already selects the configured runner, model, and extraArgs.',
          'Pass `effort` on an ask_<agent> call to override the configured reasoning effort for that one run.',
          'Use mode "read-only" for analysis. Read-only calls default to worktree "off".',
          'Use mode "edit" or "full-access" with worktree "auto" for implementation to avoid concurrent edits.',
          'Codex models come from local `codex debug models --bundled`; OpenCode models come from local `opencode models` without `--refresh`.',
          'Gemini and Claude models are CLI aliases, not account-entitled model lists.',
        ],
      });
    },
  };

  const cleanupTool: UnifiedTool = {
    name: 'cleanup_worktree',
    description: 'Remove a Sidekick-managed worktree recorded in task metadata. This never deletes arbitrary paths.',
    zodSchema: CleanupSchema,
    category: 'utility',
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    async execute(args, context?: ToolExecutionContext) {
      const parsed = CleanupSchema.parse(args);
      return cleanupWorktree({
        taskId: parsed.taskId,
        worktreeId: parsed.worktreeId,
        force: parsed.force,
        metadataStore,
        context,
      });
    },
  };

  return [setupTool, ...askTools, listAgentsTool, cleanupTool];
}
