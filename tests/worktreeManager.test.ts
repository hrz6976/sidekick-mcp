import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { TaskMetadataStore } from '../src/tasks/metadataStore.js';
import { cleanupWorktree, createWorktree } from '../src/worktrees/index.js';

describe('worktree manager', () => {
  it('returns native worktree handles for Claude and Gemini', async () => {
    await expect(createWorktree({
      agent: 'claude',
      taskId: 'abc-123',
      baseCwd: '/repo',
      mode: 'auto',
      worktreeSupport: 'native',
      worktreeRootDir: '/tmp/worktrees',
    })).resolves.toEqual({
      id: 'sidekick-abc123-claude',
      kind: 'native',
      cwd: '/repo',
      name: 'sidekick-abc123-claude',
    });
  });

  it('refuses cleanup without Sidekick metadata', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'sidekick-worktree-'));
    const metadataStore = new TaskMetadataStore(root);

    try {
      await expect(cleanupWorktree({
        worktreeId: 'not-recorded',
        metadataStore,
      })).rejects.toThrow('Cleanup only accepts worktrees recorded by Sidekick');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
