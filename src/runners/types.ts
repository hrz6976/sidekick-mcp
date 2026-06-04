import type { AgentConfig, RunnerName, SidekickMode } from '../config.js';
import type { ToolExecutionContext } from '../execution.js';

export interface WorktreeHandle {
  id: string;
  kind: 'none' | 'native' | 'managed';
  cwd: string;
  name?: string;
  path?: string;
}

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
  listModels(config: AgentConfig, context?: ToolExecutionContext): Promise<string[]>;
  run(request: RunRequest): Promise<RunResult>;
  buildArgs(request: RunRequest): string[];
}
