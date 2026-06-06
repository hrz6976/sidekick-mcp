import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('source boundaries', () => {
  it('keeps small shared types close to their owning modules', () => {
    expect(existsSync(new URL('../src/constants.ts', import.meta.url))).toBe(false);
  });

  it('keeps worktree creation driven by runner capabilities', () => {
    const worktreeSource = source('../src/worktrees/index.ts');

    expect(worktreeSource).toContain("request.worktreeSupport === 'native'");
    expect(worktreeSource).not.toMatch(/\b(claude|gemini|codex|opencode)\b/);
  });

  it('keeps ask task execution lifecycle in the task coordinator', () => {
    const toolSource = source('../src/tools/sidekick.ts');
    const coordinatorSource = source('../src/tasks/runCoordinator.ts');

    expect(toolSource).toContain('new TaskRunCoordinator(config, metadataStore)');
    expect(toolSource).not.toMatch(/\brandomUUID\b|\bcreateWorktree\b|\bappendStdout\b|\bwriteResult\b/);
    expect(coordinatorSource).toMatch(/\brandomUUID\b/);
    expect(coordinatorSource).toMatch(/\bcreateWorktree\b/);
    expect(coordinatorSource).toMatch(/\bappendStdout\b/);
    expect(coordinatorSource).toMatch(/\bwriteResult\b/);
  });
});
