import { describe, expect, it } from 'vitest';

import { parseCliArgs } from '../src/cli.js';

describe('sidekick CLI argument parsing', () => {
  it('parses run commands for ensemble prompt files', () => {
    expect(parseCliArgs([
      'run',
      '--agent',
      'codex',
      '--prompt-file',
      'TASK.md',
      '--cwd',
      '/repo',
      '--mode',
      'read-only',
      '--worktree',
      'off',
      '--effort',
      'high',
      '--trajectory',
      '--no-progress',
      '--json',
    ])).toEqual({
      command: 'run',
      json: true,
      progress: false,
      agent: 'codex',
      promptFile: 'TASK.md',
      cwd: '/repo',
      mode: 'read-only',
      worktree: 'off',
      effort: 'high',
      trajectory: true,
    });
  });

  it('parses trajectory export forms', () => {
    expect(parseCliArgs([
      'run',
      '--agent',
      'codex',
      '--prompt',
      'hello',
      '--trajectory',
      'out/trajectory.json',
    ])).toEqual({
      command: 'run',
      json: false,
      progress: true,
      agent: 'codex',
      prompt: 'hello',
      trajectory: 'out/trajectory.json',
    });

    expect(parseCliArgs([
      'run',
      '--agent',
      'codex',
      '--prompt',
      'hello',
      '--trajectory=out/trajectory.json',
      '--json',
    ])).toEqual({
      command: 'run',
      json: true,
      progress: true,
      agent: 'codex',
      prompt: 'hello',
      trajectory: 'out/trajectory.json',
    });
  });

  it('rejects missing required run fields', () => {
    expect(() => parseCliArgs(['run', '--prompt', 'hello'])).toThrow('run requires --agent');
    expect(() => parseCliArgs(['run', '--agent', 'codex'])).toThrow('run requires --prompt-file');
    expect(() => parseCliArgs([
      'run',
      '--agent',
      'codex',
      '--prompt',
      'hello',
      '--prompt-file',
      'TASK.md',
    ])).toThrow('either --prompt or --prompt-file');
    expect(() => parseCliArgs([
      'run',
      '--agent',
      'codex',
      '--prompt',
      'hello',
      '--trajectory=',
    ])).toThrow('Missing value for --trajectory=');
  });

  it('validates mode, worktree, and cleanup arguments', () => {
    expect(() => parseCliArgs(['run', '--agent', 'codex', '--prompt', 'hello', '--mode', 'plan']))
      .toThrow('Invalid --mode');
    expect(() => parseCliArgs(['run', '--agent', 'codex', '--prompt', 'hello', '--worktree', 'managed']))
      .toThrow('Invalid --worktree');
    expect(() => parseCliArgs(['cleanup'])).toThrow('cleanup requires --task-id');
    expect(parseCliArgs(['cleanup', '--task-id', 'task-1', '--force', '--json'])).toEqual({
      command: 'cleanup',
      json: true,
      progress: true,
      taskId: 'task-1',
      force: true,
    });
  });
});
