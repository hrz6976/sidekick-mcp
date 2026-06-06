import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/commandExecutor.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/commandExecutor.js')>();
  return {
    ...actual,
    executeCommand: vi.fn(),
  };
});

import type { AgentConfig } from '../src/config.js';
import { BaseRunner } from '../src/runners/base.js';
import { getRunner, getRunnerAdapters } from '../src/runners/registry.js';
import type { RunRequest } from '../src/runners/types.js';
import { executeCommand } from '../src/utils/commandExecutor.js';
import type { WorktreeHandle } from '../src/worktrees/types.js';

const agentConfig: AgentConfig = {
  runner: 'codex',
  enabled: true,
  command: 'agent-cli',
  extraArgs: [],
};

const worktree: WorktreeHandle = {
  id: 'wt',
  kind: 'managed',
  cwd: '/repo/wt',
  path: '/repo/wt',
};

function request(overrides: Partial<RunRequest> = {}): RunRequest {
  return {
    agent: 'codex',
    model: 'model-name',
    prompt: 'do work',
    mode: 'edit',
    cwd: '/repo/wt',
    agentConfig,
    worktree,
    ...overrides,
  };
}

describe('runners', () => {
  beforeEach(() => {
    vi.mocked(executeCommand).mockReset();
  });

  it('builds Claude print stream-json commands with native worktree and permission mode', () => {
    const runner = getRunner('claude');
    const args = runner.buildArgs(request({
      agent: 'claude',
      worktree: { id: 'sidekick-1-claude', kind: 'native', cwd: '/repo', name: 'sidekick-1-claude' },
    }));

    expect(args).toEqual(expect.arrayContaining([
      '--print',
      '--output-format',
      'stream-json',
      '--verbose',
      '--worktree',
      'sidekick-1-claude',
      '--model',
      'model-name',
      '--permission-mode',
      'acceptEdits',
    ]));
  });

  it('builds Gemini commands with skip-trust and non-yolo edit mode', () => {
    const runner = getRunner('gemini');
    const args = runner.buildArgs(request({
      agent: 'gemini',
      worktree: { id: 'sidekick-1-gemini', kind: 'native', cwd: '/repo', name: 'sidekick-1-gemini' },
    }));

    expect(args).toEqual(expect.arrayContaining([
      '--skip-trust',
      '--prompt',
      'do work',
      '--model',
      'model-name',
      '--output-format',
      'stream-json',
      '--approval-mode',
      'auto_edit',
      '--worktree',
      'sidekick-1-gemini',
    ]));
    expect(args).not.toContain('yolo');
  });

  it('builds Codex exec commands with json and cd', () => {
    const runner = getRunner('codex');
    const args = runner.buildArgs(request());
    expect(args).toEqual(expect.arrayContaining([
      '--json',
      '--cd',
      '/repo/wt',
      '--sandbox',
      'workspace-write',
      '--skip-git-repo-check',
      '--model',
      'model-name',
    ]));
    expect(args.slice(0, 1)).toEqual(['exec']);
    expect(args.slice(-2)).toEqual([
      '--',
      'do work',
    ]);
  });

  it('builds OpenCode run commands with dir, model, and json format', () => {
    const runner = getRunner('opencode');
    const args = runner.buildArgs(request({ agent: 'opencode' }));
    expect(args).toEqual(expect.arrayContaining([
      '--dir',
      '/repo/wt',
      '--format',
      'json',
      '--thinking',
      '--model',
      'model-name',
    ]));
    expect(args.slice(0, 1)).toEqual(['run']);
    expect(args.slice(-2)).toEqual([
      '--',
      'do work',
    ]);
  });

  it('omits model flags when the request uses the CLI default model', () => {
    expect(getRunner('codex').buildArgs(request({ model: '' }))).not.toContain('--model');
    expect(getRunner('opencode').buildArgs(request({ agent: 'opencode', model: '' }))).not.toContain('--model');
  });

  it('maps effort to runner-specific CLI flags', () => {
    const claudeArgs = getRunner('claude').buildArgs(request({
      agent: 'claude',
      agentConfig: { ...agentConfig, runner: 'claude', effort: 'high' },
    }));
    expect(claudeArgs).toEqual(expect.arrayContaining(['--effort', 'high']));

    const codexArgs = getRunner('codex').buildArgs(request({
      agentConfig: { ...agentConfig, effort: 'high' },
    }));
    expect(codexArgs).toEqual(expect.arrayContaining([
      '--config',
      'model_reasoning_effort="high"',
    ]));

    const opencodeArgs = getRunner('opencode').buildArgs(request({
      agent: 'opencode',
      agentConfig: { ...agentConfig, runner: 'opencode', effort: 'max' },
    }));
    expect(opencodeArgs).toEqual(expect.arrayContaining(['--variant', 'max']));

    const geminiArgs = getRunner('gemini').buildArgs(request({
      agent: 'gemini',
      agentConfig: { ...agentConfig, runner: 'gemini', effort: 'high' },
    }));
    expect(geminiArgs).not.toContain('--effort');
    expect(geminiArgs).not.toContain('--variant');
    expect(geminiArgs).not.toContain('--config');
  });

  it('does not duplicate reasoning flags already provided through extraArgs', () => {
    const claudeArgs = getRunner('claude').buildArgs(request({
      agent: 'claude',
      agentConfig: {
        ...agentConfig,
        runner: 'claude',
        effort: 'high',
        extraArgs: ['--effort', 'low'],
      },
    }));
    expect(claudeArgs.filter((arg) => arg === '--effort')).toHaveLength(1);
    expect(claudeArgs).toContain('low');
    expect(claudeArgs).not.toContain('high');

    const codexArgs = getRunner('codex').buildArgs(request({
      agentConfig: {
        ...agentConfig,
        effort: 'high',
        extraArgs: ['--config', 'model_reasoning_effort="low"'],
      },
    }));
    expect(codexArgs.filter((arg) => arg === '--config')).toHaveLength(1);
    expect(codexArgs).toContain('model_reasoning_effort="low"');
    expect(codexArgs).not.toContain('model_reasoning_effort="high"');

    const opencodeArgs = getRunner('opencode').buildArgs(request({
      agent: 'opencode',
      agentConfig: {
        ...agentConfig,
        runner: 'opencode',
        effort: 'high',
        extraArgs: ['--variant', 'low'],
      },
    }));
    expect(opencodeArgs.filter((arg) => arg === '--variant')).toHaveLength(1);
    expect(opencodeArgs).toContain('low');
    expect(opencodeArgs).not.toContain('high');
  });

  it('lists OpenCode models without refresh', async () => {
    vi.mocked(executeCommand).mockResolvedValue('github-copilot/claude-sonnet-4.5\n');
    const models = await getRunner('opencode').listModels({
      runner: 'opencode',
      enabled: true,
      command: 'opencode',
      extraArgs: [],
    });

    expect(models).toEqual(['github-copilot/claude-sonnet-4.5']);
    expect(executeCommand).toHaveBeenCalledWith(
      'opencode',
      ['models'],
      expect.objectContaining({ timeoutMs: 30_000 }),
    );
    expect(vi.mocked(executeCommand).mock.calls.flatMap((call) => call[1])).not.toContain('--refresh');
  });

  it('lists Codex models from the local bundled catalog', async () => {
    vi.mocked(executeCommand).mockResolvedValue(JSON.stringify({
      models: [
        { slug: 'gpt-5.5', visibility: 'list' },
        { slug: 'gpt-5.4-mini', visibility: 'list' },
        { slug: 'codex-auto-review', visibility: 'hide' },
        { id: 'custom-codex-model', visibility: 'list' },
        { name: 'legacy-codex-model' },
      ],
    }));

    const models = await getRunner('codex').listModels({
      runner: 'codex',
      enabled: true,
      command: 'codex',
      extraArgs: [],
    });

    expect(models).toEqual([
      'gpt-5.5',
      'gpt-5.4-mini',
      'custom-codex-model',
      'legacy-codex-model',
    ]);
    expect(executeCommand).toHaveBeenCalledWith(
      'codex',
      ['debug', 'models', '--bundled'],
      expect.objectContaining({ timeoutMs: 30_000 }),
    );
  });

  it('falls back to built-in Codex hints when local catalog parsing fails', async () => {
    vi.mocked(executeCommand).mockResolvedValue('not json');

    const models = await getRunner('codex').listModels({
      runner: 'codex',
      enabled: true,
      command: 'codex',
      extraArgs: [],
    });

    expect(models).toEqual(['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex']);
  });

  it('uses built-in CLI aliases for Gemini and Claude', async () => {
    await expect(getRunner('gemini').listModels({
      runner: 'gemini',
      enabled: true,
      command: 'gemini',
      extraArgs: [],
    })).resolves.toEqual(['auto', 'pro', 'flash', 'flash-lite']);

    await expect(getRunner('claude').listModels({
      runner: 'claude',
      enabled: true,
      command: 'claude',
      extraArgs: [],
    })).resolves.toEqual(['sonnet', 'opus', 'haiku']);

    expect(executeCommand).not.toHaveBeenCalled();
  });

  it('exposes runner behavior through adapter capabilities', () => {
    const adapters = getRunnerAdapters();

    expect(adapters.map((adapter) => adapter.name)).toEqual([
      'claude',
      'gemini',
      'codex',
      'opencode',
    ]);
    for (const adapter of adapters) {
      expect(adapter).toBeInstanceOf(BaseRunner);
      expect(adapter.defaultCommand).toBe(adapter.name);
      expect(adapter.modelDiscoveryDescription.length).toBeGreaterThan(0);
      expect(['native', 'managed']).toContain(adapter.worktreeSupport);
      expect(adapter.buildArgs(request({
        agent: adapter.name,
        agentConfig: { ...agentConfig, runner: adapter.name },
      }))).toContain('do work');
      expect(adapter.extractOutput('plain answer')).toEqual({ answer: 'plain answer' });
      expect(adapter.createProgressRenderer().flush()).toEqual([]);
    }
    expect(() => getRunner('gemini').validateEffort('high')).toThrow(
      'Runner "gemini" does not support effort overrides.',
    );
    expect(() => getRunner('codex').validateEffort('extreme')).toThrow(
      'Runner "codex" effort must be one of: minimal, low, medium, high.',
    );
    expect(getRunner('claude').worktreeSupport).toBe('native');
    expect(getRunner('gemini').worktreeSupport).toBe('native');
    expect(getRunner('codex').worktreeSupport).toBe('managed');
    expect(getRunner('opencode').worktreeSupport).toBe('managed');
  });

  it('keeps setup recommendation templates on runner instances', () => {
    expect(getRunner('gemini').recommendedAgents(['auto'])).toEqual({
      gemini: {
        runner: 'gemini',
        model: 'auto',
        extraArgs: [],
        description: 'Ask Gemini for broad reasoning and implementation review.',
      },
    });
    expect(getRunner('opencode').recommendedAgents([
      'deepseek/deepseek-chat',
      'moonshot/kimi-k2',
    ])).toEqual({
      deepseek: {
        runner: 'opencode',
        model: 'deepseek/deepseek-chat',
        effort: 'high',
        extraArgs: [],
        description: 'Ask DeepSeek through OpenCode with high reasoning effort.',
      },
      kimi: {
        runner: 'opencode',
        model: 'moonshot/kimi-k2',
        extraArgs: [],
        description: 'Ask Kimi through OpenCode.',
      },
    });
  });

  it('keeps shared output and progress modules generic', () => {
    const outputSource = readFileSync(new URL('../src/runners/output.ts', import.meta.url), 'utf8');
    const progressSource = readFileSync(new URL('../src/runners/progress.ts', import.meta.url), 'utf8');
    const runnerNames = /\b(claude|gemini|codex|opencode|Claude|Gemini|Codex|OpenCode|RunnerName)\b/;

    expect(outputSource).not.toMatch(runnerNames);
    expect(progressSource).not.toMatch(runnerNames);
  });
});
