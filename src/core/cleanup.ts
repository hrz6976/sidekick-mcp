import type { SidekickConfig } from '../config.js';
import type { ToolExecutionContext } from '../execution.js';
import { TaskMetadataStore } from '../tasks/metadataStore.js';
import { cleanupWorktree } from '../worktrees/index.js';

export interface SidekickCleanupRequest {
  taskId?: string;
  worktreeId?: string;
  force?: boolean;
}

export async function cleanupSidekickWorktree(
  config: SidekickConfig,
  request: SidekickCleanupRequest,
  context?: ToolExecutionContext,
): Promise<string> {
  const metadataStore = new TaskMetadataStore(config.taskRootDir);
  return cleanupWorktree({
    taskId: request.taskId,
    worktreeId: request.worktreeId,
    force: request.force,
    metadataStore,
    context,
  });
}
