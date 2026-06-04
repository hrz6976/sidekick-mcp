import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { TaskMetadataStore } from '../src/tasks/metadataStore.js';

describe('TaskMetadataStore', () => {
  it('marks stale running tasks interrupted on startup', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'sidekick-metadata-'));
    const store = new TaskMetadataStore(root);

    try {
      await store.create({
        taskId: 'task-1',
        status: 'running',
        agent: 'codex',
        runner: 'codex',
        model: 'gpt-5.1-codex-max',
        mode: 'edit',
        baseCwd: '/repo',
        worktree: { id: 'wt', kind: 'none', cwd: '/repo' },
      });

      await store.markInterruptedRunningTasks();

      const metadata = await store.read('task-1');
      expect(metadata?.status).toBe('interrupted');
      expect(metadata?.error).toContain('restarted');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('finds metadata by worktree id', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'sidekick-metadata-'));
    const store = new TaskMetadataStore(root);

    try {
      await store.create({
        taskId: 'task-2',
        status: 'completed',
        agent: 'deepseek',
        runner: 'opencode',
        model: 'gpt-5.1-codex-max',
        mode: 'edit',
        baseCwd: '/repo',
        worktree: { id: 'sidekick-task2-codex', kind: 'managed', cwd: '/repo/wt', path: '/repo/wt' },
      });

      expect((await store.findByWorktreeId('sidekick-task2-codex'))?.taskId).toBe('task-2');
      expect(await store.findByWorktreeId('missing')).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
