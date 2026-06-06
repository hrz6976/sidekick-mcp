import type { Logger } from './logger.js';

export type ToolTimeoutClass = 'ask' | 'help' | 'none';

export interface SidekickProjectRoot {
  uri: string;
  name?: string;
}

export interface ToolExecutionContext {
  signal?: AbortSignal;
  onProgress?: (newOutput: string) => void;
  timeoutMs?: number;
  killGraceMs?: number;
  cwd?: string;
  projectRoots?: SidekickProjectRoot[];
  env?: NodeJS.ProcessEnv;
  requestId?: string | number;
  taskId?: string;
  logger?: Logger;
}
