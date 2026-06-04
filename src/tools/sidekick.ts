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

function findModel(models: string[], pattern: RegExp): string | undefined {
  return models.find((model) => pattern.test(model));
}

function modelDiscoveryDescription(runner: AgentConfig['runner']): string {
  switch (runner) {
    case 'codex':
      return '`codex debug models --bundled` local bundled catalog parsing; falls back to Sidekick built-in Codex hints';
    case 'opencode':
      return '`opencode models` local provider-layer parsing; Sidekick never uses `--refresh` by default';
    case 'gemini':
      return 'Sidekick built-in Gemini CLI aliases/candidates; Gemini CLI has no headless model-list command';
    case 'claude':
      return 'Sidekick built-in Claude Code aliases/candidates; Claude CLI has no headless model-list command';
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
    const deepseek = findModel(opencode.models, /deepseek/i);
    const kimi = findModel(opencode.models, /kimi|moonshot/i);
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
      agents.opencode = {
        runner: 'opencode',
        ...(firstModel(opencode.models) ? { model: firstModel(opencode.models) } : {}),
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
      modelHints: models,
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
        modelHints: agentConfig.enabled ? await safeListModels(agentConfig, context) : [],
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
    '1. Read the discovery data above before editing config. Prefer installed runners, configured models, and modelHints with clear source labels.',
    '2. If the config is missing, create it. If it is loaded, patch it instead of overwriting unrelated existing agents.',
    '3. Each key in `agents` becomes an MCP tool named `ask_<key>`. Use memorable aliases such as gemini, claude, codex, deepseek, or kimi.',
    '4. For each helper, set `runner` to one of claude, gemini, codex, or opencode. Use `model` for the model/provider id; do not put model flags in `extraArgs`.',
    '5. Use `reasoningEffort` for common effort controls. Sidekick maps it to Claude `--effort`, Codex `--config model_reasoning_effort=...`, and OpenCode `--variant`. Gemini CLI has no direct reasoning-effort flag.',
    '6. Use `extraArgs` for other advanced CLI/model options such as thinking budgets, provider-specific flags, or approval tuning.',
    '7. Gemini automatically gets `--skip-trust` from Sidekick. Only add Gemini `extraArgs` for extra behavior beyond that default.',
    '8. Ask tools run in the MCP client project root when the client supports roots; otherwise they use the MCP server launch directory.',
    '9. Read-only investigations usually do not need a worktree; call ask tools with `mode: "read-only"` and omit `worktree` to use the selected project directory without creating a worktree.',
    '10. For edit or full-access tasks, prefer `worktree: "auto"` so helper agents work in an isolated worktree and avoid concurrent edits to the main checkout.',
    '11. Codex model hints come from local `codex debug models --bundled`; OpenCode model hints come from local `opencode models`. Gemini and Claude use Sidekick built-in CLI aliases/candidates.',
    '12. Do not describe modelHints as account-entitled models. They are local catalog entries, provider-layer discoveries, or built-in candidates until a real model call validates them.',
    '13. Create or update the Sidekick home directory and config file:',
    `   mkdir -p ${config.sidekickHome}`,
    `   write JSON to ${config.configPath}`,
    '14. Use this recommended starter config as a base, then adjust aliases, models, reasoningEffort, and extraArgs to match the user request:',
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
  ].join(' ');
}

function askPromptDescription(agentName: string): string {
  return [
    `Ask the configured ${agentName} helper agent to work on a task.`,
    'Sidekick uses the MCP client project root when roots are available, or the MCP server launch directory otherwise.',
    'Use read-only mode for investigation and review; it does not create a worktree unless worktree is explicitly set.',
    'Use edit/full-access mode with worktree auto for implementation work so concurrent helper edits stay isolated.',
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

      const progressRenderer = createCliProgressRenderer(agentConfig.runner);
      let capturedStdout = '';
      const progress = (chunk: string) => {
        capturedStdout += chunk;
        void metadataStore.appendStdout(taskId, chunk);
        for (const message of progressRenderer.onChunk(chunk)) {
          executionContext.onProgress?.(message);
        }
      };

      try {
        const runner = getRunner(agentConfig.runner);
        const result = await runner.run({
          agent: agentConfig.runner,
          model,
          prompt: parsed.prompt,
          mode,
          cwd: worktree.cwd,
          env: executionContext.env,
          agentConfig,
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
        const extracted = extractRunOutput(agentConfig.runner, result.stdout);
        await metadataStore.update(taskId, {
          status: 'completed',
          exitCode: result.exitCode,
        });

        const response = {
          taskId,
          status: 'completed',
          agent: agentName,
          runner: agentConfig.runner,
          model: model || '(cli default)',
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
    description: 'Inspect local Sidekick runner installation and model hints, then return an executable prompt for creating or updating Sidekick MCP configuration.',
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

  if (config.setupRequired || !config.userConfig) {
    return [setupTool];
  }

  const askTools = Object.entries(config.userConfig.agents)
    .filter(([, agentConfig]) => agentConfig.enabled)
    .map(([agentName, agentConfig]) => createAskTool(
      config,
      metadataStore,
      agentName,
      agentConfig,
    ));

  const listAgentsTool: UnifiedTool = {
    name: 'list_agents',
    description: 'List configured Sidekick helper agents, their runners, installation status, defaults, and model hints.',
    zodSchema: z.object({}),
    category: 'utility',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async execute(_args, context?: ToolExecutionContext) {
      const userConfig = ensureConfigured(config);
      const agents = await Promise.all(Object.entries(userConfig.agents).map(async ([agentName, agentConfig]) => {
        const runner = getRunner(agentConfig.runner);
        const modelHints = agentConfig.enabled
          ? await runner.listModels(agentConfig, context)
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
          modelHints,
        };
      }));

      return jsonText({
        defaults: userConfig.defaults,
        agents,
        guidance: [
          'Use ask_<agent> tools directly; the tool name already selects the configured runner, model, and extraArgs.',
          'Use mode "read-only" for analysis. Read-only calls default to worktree "off".',
          'Use mode "edit" or "full-access" with worktree "auto" for implementation to avoid concurrent edits.',
          'Codex model hints come from local `codex debug models --bundled`; OpenCode model hints come from local `opencode models` without `--refresh`.',
          'Gemini and Claude model hints are Sidekick built-in CLI aliases/candidates, not account-entitled model lists.',
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
