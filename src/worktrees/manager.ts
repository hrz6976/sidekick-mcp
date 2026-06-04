import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { RunnerName, WorktreeMode } from '../config.js';
import type { ToolExecutionContext } from '../execution.js';
import type { WorktreeHandle } from '../runners/types.js';
import { TaskMetadataStore } from '../tasks/metadataStore.js';
import { executeCommand } from '../utils/commandExecutor.js';

export interface WorktreeRequest {
  agent: RunnerName;
  taskId: string;
  baseCwd: string;
  mode: WorktreeMode;
  worktreeRootDir: string;
  context?: ToolExecutionContext;
}

function shortTaskId(taskId: string): string {
  return taskId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'task';
}

function repoHash(repoRoot: string): string {
  return createHash('sha256').update(repoRoot).digest('hex').slice(0, 16);
}

function nativeWorktreeName(taskId: string, agent: RunnerName): string {
  return `sidekick-${shortTaskId(taskId)}-${agent}`;
}

async function git(args: string[], cwd: string, context?: ToolExecutionContext): Promise<string> {
  return executeCommand('git', args, {
    ...context,
    cwd,
    timeoutMs: 30_000,
  });
}

export async function createWorktree(request: WorktreeRequest): Promise<WorktreeHandle> {
  if (request.mode === 'off') {
    return {
      id: `none-${request.taskId}`,
      kind: 'none',
      cwd: request.baseCwd,
    };
  }

  const name = nativeWorktreeName(request.taskId, request.agent);
  if (request.agent === 'claude' || request.agent === 'gemini') {
    return {
      id: name,
      kind: 'native',
      cwd: request.baseCwd,
      name,
    };
  }

  let repoRoot: string;
  try {
    repoRoot = (await git(['rev-parse', '--show-toplevel'], request.baseCwd, request.context)).trim();
  } catch {
    throw new Error(
      `Sidekick needs a git repository to create a managed worktree for ${request.agent}. ` +
      `Run from inside a git repo, or call the ask tool with worktree: "off" for a read-only task.`,
    );
  }

  const repoDir = path.join(request.worktreeRootDir, repoHash(repoRoot));
  const worktreePath = path.join(repoDir, name);
  await fs.mkdir(repoDir, { recursive: true });

  try {
    await fs.access(worktreePath);
  } catch {
    await git(['worktree', 'add', '-b', name, worktreePath, 'HEAD'], repoRoot, request.context);
  }

  return {
    id: name,
    kind: 'managed',
    cwd: worktreePath,
    name,
    path: worktreePath,
  };
}

export interface CleanupRequest {
  taskId?: string;
  worktreeId?: string;
  force?: boolean;
  metadataStore: TaskMetadataStore;
  context?: ToolExecutionContext;
}

export async function cleanupWorktree(request: CleanupRequest): Promise<string> {
  if (!request.taskId && !request.worktreeId) {
    throw new Error('Provide taskId or worktreeId. Sidekick will not delete arbitrary paths.');
  }

  const metadata = request.taskId
    ? await request.metadataStore.read(request.taskId)
    : request.worktreeId
      ? await request.metadataStore.findByWorktreeId(request.worktreeId)
      : undefined;

  if (!metadata) {
    throw new Error(
      `No Sidekick metadata found for ${request.taskId ? `taskId "${request.taskId}"` : `worktreeId "${request.worktreeId}"`}. ` +
      'Cleanup only accepts worktrees recorded by Sidekick.',
    );
  }

  const worktree = metadata.worktree;
  if (request.worktreeId && worktree.id !== request.worktreeId) {
    throw new Error(
      `Task "${metadata.taskId}" recorded worktree "${worktree.id}", not "${request.worktreeId}".`,
    );
  }

  if (worktree.kind !== 'managed' || !worktree.path) {
    await request.metadataStore.update(metadata.taskId, {
      worktree: {
        ...worktree,
        kind: worktree.kind,
      },
    });
    return `Task ${metadata.taskId} used ${worktree.kind} worktree mode. Sidekick metadata was retained; use the ${metadata.agent} CLI native worktree cleanup if needed.`;
  }

  const dirty = (await git(['status', '--porcelain'], worktree.path, request.context)).trim();
  if (dirty && !request.force) {
    throw new Error(
      `Worktree ${worktree.path} has uncommitted changes. Inspect or merge them, then retry with force: true if deletion is intended.`,
    );
  }

  const args = request.force
    ? ['worktree', 'remove', '--force', worktree.path]
    : ['worktree', 'remove', worktree.path];
  await git(args, metadata.baseCwd, request.context);
  await request.metadataStore.update(metadata.taskId, {
    worktree: {
      ...worktree,
      kind: 'none',
      cwd: metadata.baseCwd,
      path: undefined,
    },
  });

  return `Removed Sidekick worktree ${worktree.path} for task ${metadata.taskId}.`;
}
