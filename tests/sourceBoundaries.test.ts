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
    const coreSource = [
      source('../src/core/agents.ts'),
      source('../src/core/cleanup.ts'),
      source('../src/core/common.ts'),
      source('../src/core/run.ts'),
      source('../src/core/setup.ts'),
    ].join('\n');
    const coordinatorSource = source('../src/tasks/runCoordinator.ts');

    expect(coreSource).toContain('new TaskRunCoordinator(config, metadataStore)');
    expect(toolSource).not.toMatch(/\brandomUUID\b|\bcreateWorktree\b|\bappendStdout\b|\bwriteResult\b/);
    expect(coordinatorSource).toMatch(/\brandomUUID\b/);
    expect(coordinatorSource).toMatch(/\bcreateWorktree\b/);
    expect(coordinatorSource).toMatch(/\bappendStdout\b/);
    expect(coordinatorSource).toMatch(/\bwriteResult\b/);
  });

  it('keeps the sidekick CLI path free of MCP-only modules', () => {
    const executionSource = source('../src/execution.ts');
    const coreSource = [
      source('../src/core/agents.ts'),
      source('../src/core/cleanup.ts'),
      source('../src/core/common.ts'),
      source('../src/core/run.ts'),
      source('../src/core/setup.ts'),
    ].join('\n');
    const cliSource = source('../src/cli.ts');
    const trajectorySource = [
      source('../src/runners/trajectory.ts'),
      source('../src/runners/claude.ts'),
      source('../src/runners/codex.ts'),
      source('../src/runners/gemini.ts'),
      source('../src/runners/opencode.ts'),
    ].join('\n');
    const combined = [executionSource, coreSource, cliSource, trajectorySource].join('\n');

    expect(combined).not.toMatch(/@modelcontextprotocol\/sdk/);
    expect(combined).not.toMatch(/serverApp|tools\/registry|protocolTaskStore/);
  });

  it('keeps Sidekick core modules separated by domain', () => {
    const setupSource = source('../src/core/setup.ts');
    const agentsSource = source('../src/core/agents.ts');
    const runSource = source('../src/core/run.ts');
    const cleanupSource = source('../src/core/cleanup.ts');

    expect(setupSource).not.toMatch(/TaskRunCoordinator|cleanupWorktree|TaskMetadataStore/);
    expect(agentsSource).not.toMatch(/TaskRunCoordinator|cleanupWorktree|TaskMetadataStore/);
    expect(runSource).toMatch(/TaskRunCoordinator/);
    expect(runSource).not.toMatch(/detectAvailableClis|CliAvailability|buildRecommendedConfig/);
    expect(cleanupSource).toMatch(/cleanupWorktree/);
    expect(cleanupSource).not.toMatch(/TaskRunCoordinator|detectAvailableClis|CliAvailability/);
  });
});
