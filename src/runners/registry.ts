import type { AgentConfig, RunnerName, SidekickMode } from '../config.js';
import type { ToolExecutionContext } from '../execution.js';
import { executeCommand } from '../utils/commandExecutor.js';
import type { AgentRunner, RunRequest, RunResult } from './types.js';

const FALLBACK_MODELS: Record<RunnerName, string[]> = {
  claude: ['sonnet', 'opus', 'haiku'],
  gemini: ['auto', 'pro', 'flash', 'flash-lite', 'gemini-3.1-pro-preview', 'gemini-3-flash-preview'],
  codex: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex'],
  opencode: [],
};

function hasArg(args: string[], flag: string): boolean {
  return args.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
}

function hasConfigOverride(args: string[], key: string): boolean {
  return args.some((arg, index) => {
    if ((arg === '-c' || arg === '--config') && args[index + 1]?.startsWith(`${key}=`)) {
      return true;
    }
    return arg.startsWith(`-c=${key}=`) || arg.startsWith(`--config=${key}=`);
  });
}

function appendReasoningEffort(
  args: string[],
  agent: RunnerName,
  effort?: string,
): string[] {
  if (!effort) {
    return args;
  }

  switch (agent) {
    case 'claude':
      return hasArg(args, '--effort') ? args : [...args, '--effort', effort];
    case 'codex':
      return hasConfigOverride(args, 'model_reasoning_effort')
        ? args
        : [...args, '--config', `model_reasoning_effort=${JSON.stringify(effort)}`];
    case 'opencode':
      return hasArg(args, '--variant') ? args : [...args, '--variant', effort];
    case 'gemini':
      return args;
  }
}

function appendPrompt(args: string[], prompt: string): string[] {
  return [...args, '--', prompt];
}

function claudePermissionMode(mode: SidekickMode): string {
  switch (mode) {
    case 'read-only':
      return 'plan';
    case 'full-access':
      return 'bypassPermissions';
    default:
      return 'acceptEdits';
  }
}

function geminiApprovalMode(mode: SidekickMode): string {
  switch (mode) {
    case 'full-access':
      return 'yolo';
    case 'read-only':
      return 'default';
    default:
      return 'auto_edit';
  }
}

function uniqueModels(models: string[]): string[] {
  return models.filter((model, index) => model && models.indexOf(model) === index);
}

function parseCodexModels(output: string): string[] {
  const parsed = JSON.parse(output) as unknown;
  const records = typeof parsed === 'object' && parsed !== null && Array.isArray(
    (parsed as { models?: unknown }).models,
  )
    ? (parsed as { models: unknown[] }).models
    : Array.isArray(parsed)
      ? parsed
      : [];

  return uniqueModels(records.flatMap((record) => {
    if (!record || typeof record !== 'object') {
      return [];
    }
    const model = record as { slug?: unknown; id?: unknown; name?: unknown; visibility?: unknown };
    const id = typeof model.slug === 'string'
      ? model.slug
      : typeof model.id === 'string'
        ? model.id
        : typeof model.name === 'string'
          ? model.name
          : '';
    if (!id || model.visibility === 'hide') {
      return [];
    }
    return [id];
  }));
}

function codexSandbox(mode: SidekickMode): string {
  switch (mode) {
    case 'read-only':
      return 'read-only';
    case 'full-access':
      return 'danger-full-access';
    default:
      return 'workspace-write';
  }
}

async function runCommand(request: RunRequest, args: string[]): Promise<RunResult> {
  const stdout = await executeCommand(request.agentConfig.command, args, {
    ...request.context,
    cwd: request.cwd,
    env: request.env,
  });
  return {
    stdout,
    stderr: '',
    exitCode: 0,
    command: request.agentConfig.command,
    args,
  };
}

async function configuredModels(
  agent: RunnerName,
  config: AgentConfig,
  context?: ToolExecutionContext,
): Promise<string[]> {
  if (config.models?.length) {
    return config.models;
  }

  if (agent === 'opencode' && config.enabled) {
    try {
      const output = await executeCommand(config.command, ['models'], {
        ...context,
        timeoutMs: 30_000,
      });
      return output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.split(/\s+/)[0])
        .filter((model) => model.includes('/'))
        .filter((model, index, models) => models.indexOf(model) === index);
    } catch {
      return [];
    }
  }

  if (agent === 'codex' && config.enabled) {
    try {
      const output = await executeCommand(config.command, ['debug', 'models', '--bundled'], {
        ...context,
        timeoutMs: 30_000,
      });
      const models = parseCodexModels(output);
      return models.length ? models : FALLBACK_MODELS.codex;
    } catch {
      return FALLBACK_MODELS.codex;
    }
  }

  return FALLBACK_MODELS[agent];
}

const claudeRunner: AgentRunner = {
  name: 'claude',
  listModels: (config, context) => configuredModels('claude', config, context),
  buildArgs(request) {
    const args = appendReasoningEffort([
      ...request.agentConfig.extraArgs,
      '--print',
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      claudePermissionMode(request.mode),
    ], 'claude', request.agentConfig.reasoningEffort);
    if (request.model) {
      args.push('--model', request.model);
    }
    if (request.worktree.kind === 'native' && request.worktree.name) {
      args.push('--worktree', request.worktree.name);
    }
    return appendPrompt(args, request.prompt);
  },
  run(request) {
    return runCommand(request, this.buildArgs(request));
  },
};

const geminiRunner: AgentRunner = {
  name: 'gemini',
  listModels: (config, context) => configuredModels('gemini', config, context),
  buildArgs(request) {
    const extraArgs = appendReasoningEffort(
      [...request.agentConfig.extraArgs],
      'gemini',
      request.agentConfig.reasoningEffort,
    );
    if (!hasArg(extraArgs, '--skip-trust')) {
      extraArgs.push('--skip-trust');
    }
    const args = [
      ...extraArgs,
      '--prompt',
      request.prompt,
      '--output-format',
      'stream-json',
      '--approval-mode',
      geminiApprovalMode(request.mode),
    ];
    if (request.model) {
      args.push('--model', request.model);
    }
    if (request.worktree.kind === 'native' && request.worktree.name) {
      args.push('--worktree', request.worktree.name);
    }
    return args;
  },
  run(request) {
    return runCommand(request, this.buildArgs(request));
  },
};

const codexRunner: AgentRunner = {
  name: 'codex',
  listModels: (config, context) => configuredModels('codex', config, context),
  buildArgs(request) {
    const args = appendReasoningEffort([
      'exec',
      ...request.agentConfig.extraArgs,
      '--json',
      '--cd',
      request.cwd,
      '--sandbox',
      codexSandbox(request.mode),
      '--skip-git-repo-check',
    ], 'codex', request.agentConfig.reasoningEffort);
    if (request.model) {
      args.push('--model', request.model);
    }
    return appendPrompt(args, request.prompt);
  },
  run(request) {
    return runCommand(request, this.buildArgs(request));
  },
};

const opencodeRunner: AgentRunner = {
  name: 'opencode',
  listModels: (config, context) => configuredModels('opencode', config, context),
  buildArgs(request) {
    const args = appendReasoningEffort([
      'run',
      ...request.agentConfig.extraArgs,
      '--dir',
      request.cwd,
      '--format',
      'json',
      '--thinking',
    ], 'opencode', request.agentConfig.reasoningEffort);
    if (request.model) {
      args.push('--model', request.model);
    }
    return appendPrompt(args, request.prompt);
  },
  run(request) {
    return runCommand(request, this.buildArgs(request));
  },
};

const RUNNERS: Record<RunnerName, AgentRunner> = {
  claude: claudeRunner,
  gemini: geminiRunner,
  codex: codexRunner,
  opencode: opencodeRunner,
};

export function getRunner(agent: RunnerName): AgentRunner {
  return RUNNERS[agent];
}
