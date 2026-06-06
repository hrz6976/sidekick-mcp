import type { AgentConfig, RunnerName, SidekickMode } from '../config.js';
import type { ToolExecutionContext } from '../execution.js';
import type { WorktreeHandle } from '../worktrees/types.js';
import type { ExtractedRunOutput } from './output.js';
import type { CliProgressRenderer } from './progress.js';

export interface RunRequest {
  agent: RunnerName;
  model: string;
  prompt: string;
  mode: SidekickMode;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  agentConfig: AgentConfig;
  worktree: WorktreeHandle;
  context?: ToolExecutionContext;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  command: string;
  args: string[];
}

export interface AgentRunner {
  name: RunnerName;
  defaultCommand: string;
  fallbackModels: string[];
  fallbackRecommendationModels: string[];
  modelDiscoveryDescription: string;
  worktreeSupport: 'native' | 'managed';
  recommendedAgents(models: string[]): Record<string, unknown>;
  listModels(config: AgentConfig, context?: ToolExecutionContext): Promise<string[]>;
  run(request: RunRequest): Promise<RunResult>;
  buildArgs(request: RunRequest): string[];
  extractOutput(stdout: string): ExtractedRunOutput;
  createProgressRenderer(): CliProgressRenderer;
  validateEffort(effort?: string): void;
}
