import type { SidekickConfig, SidekickMode, WorktreeMode } from '../config.js';
import type { ToolExecutionContext } from '../execution.js';
import type { Logger } from '../logger.js';
import { getRunner } from '../runners/registry.js';
import { TaskMetadataStore } from '../tasks/metadataStore.js';
import { TaskRunCoordinator } from '../tasks/runCoordinator.js';
import { ensureConfigured, resolveMode, resolveWorktree } from './common.js';

export interface SidekickRunAgentRequest {
  agentName: string;
  prompt: string;
  mode?: SidekickMode;
  worktree?: WorktreeMode;
  effort?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  onProgress?: (newOutput: string) => void;
  trajectory?: boolean | string;
  logger?: Logger;
}

export async function runSidekickAgent(
  config: SidekickConfig,
  request: SidekickRunAgentRequest,
  context?: ToolExecutionContext,
): Promise<unknown> {
  const userConfig = ensureConfigured(config);
  const agentConfig = userConfig.agents[request.agentName];
  if (!agentConfig) {
    throw new Error(`Unknown Sidekick agent "${request.agentName}".`);
  }
  if (!agentConfig.enabled) {
    throw new Error(`Sidekick agent "${request.agentName}" is disabled.`);
  }

  getRunner(agentConfig.runner).validateEffort(request.effort);
  const mode = resolveMode(config, request.mode);
  const worktreeMode = resolveWorktree(config, mode, request.worktree);
  const metadataStore = new TaskMetadataStore(config.taskRootDir);
  const taskRunner = new TaskRunCoordinator(config, metadataStore);
  const executionContext: ToolExecutionContext = {
    ...context,
    signal: request.signal ?? context?.signal,
    onProgress: request.onProgress ?? context?.onProgress,
    cwd: request.cwd ?? context?.cwd ?? process.cwd(),
    env: request.env ?? context?.env,
    logger: request.logger ?? context?.logger,
  };

  return taskRunner.run({
    agentName: request.agentName,
    agentConfig,
    prompt: request.prompt,
    mode,
    worktreeMode,
    effort: request.effort,
    trajectory: request.trajectory,
    context: executionContext,
  });
}
