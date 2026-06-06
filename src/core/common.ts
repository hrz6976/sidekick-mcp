import type { AgentConfig, SidekickConfig, SidekickMode, WorktreeMode } from '../config.js';
import type { ToolExecutionContext } from '../execution.js';
import { getRunner } from '../runners/registry.js';

export function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function askToolName(agentName: string): string {
  return `ask_${agentName}`;
}

export function ensureConfigured(config: SidekickConfig): NonNullable<SidekickConfig['userConfig']> {
  if (!config.userConfig) {
    throw new Error(
      `Sidekick is not configured. Call setup and create ${config.configPath}.`,
    );
  }
  return config.userConfig;
}

export function resolveMode(config: SidekickConfig, mode?: SidekickMode): SidekickMode {
  return mode ?? ensureConfigured(config).defaults.mode ?? 'edit';
}

export function resolveWorktree(
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

export function uniqueStrings(values: Array<string | undefined>): string[] {
  return values.filter((value, index): value is string =>
    Boolean(value) && values.indexOf(value) === index,
  );
}

export async function safeListModels(
  agentConfig: AgentConfig,
  context?: ToolExecutionContext,
): Promise<string[]> {
  try {
    return await getRunner(agentConfig.runner).listModels(agentConfig, context);
  } catch {
    return agentConfig.models ?? [];
  }
}
