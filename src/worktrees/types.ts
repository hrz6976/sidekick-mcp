import type { RunnerName, WorktreeMode } from '../config.js';
import type { ToolExecutionContext } from '../execution.js';
import type { TaskMetadataStore } from '../tasks/metadataStore.js';

export interface WorktreeHandle {
  id: string;
  kind: 'none' | 'native' | 'managed';
  cwd: string;
  name?: string;
  path?: string;
}

export interface WorktreeRequest {
  agent: RunnerName;
  taskId: string;
  baseCwd: string;
  mode: WorktreeMode;
  worktreeSupport: 'native' | 'managed';
  worktreeRootDir: string;
  context?: ToolExecutionContext;
}

export interface CleanupRequest {
  taskId?: string;
  worktreeId?: string;
  force?: boolean;
  metadataStore: TaskMetadataStore;
  context?: ToolExecutionContext;
}
