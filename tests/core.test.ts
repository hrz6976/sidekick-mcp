import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/commandExecutor.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/commandExecutor.js')>();
  return {
    ...actual,
    executeCommand: vi.fn(),
  };
});

import type { SidekickConfig } from '../src/config.js';
import { getSetupState, listSidekickAgents, runSidekickAgent, cleanupSidekickWorktree } from '../src/core/index.js';
import { TaskMetadataStore } from '../src/tasks/metadataStore.js';
import { executeCommand } from '../src/utils/commandExecutor.js';

function createConfig(home = mkdtempSync(path.join(os.tmpdir(), 'sidekick-core-'))): SidekickConfig {
  return {
    cliDetectTimeoutMs: 100,
    killGraceMs: 50,
    taskTtlMs: 60_000,
    taskPollIntervalMs: 5,
    progressIdleHeartbeatMs: 25,
    progressThrottleMs: 1,
    logPath: path.join(home, 'logs', 'sidekick.log'),
    logLevel: 'debug',
    stderrLogLevel: 'silent',
    sidekickHome: home,
    configPath: path.join(home, 'config.json'),
    taskRootDir: path.join(home, 'tasks'),
    worktreeRootDir: path.join(home, 'worktrees'),
    setupRequired: false,
    userConfig: {
      agents: {
        codex: {
          runner: 'codex',
          enabled: true,
          command: 'codex',
          model: 'fake-codex',
          extraArgs: [],
        },
      },
      defaults: { mode: 'edit', worktree: 'auto' },
    },
  };
}

describe('Sidekick core APIs', () => {
  let config: SidekickConfig;

  beforeEach(() => {
    vi.mocked(executeCommand).mockReset();
    config = createConfig();
  });

  afterEach(() => {
    rmSync(config.sidekickHome, { recursive: true, force: true });
  });

  it('returns setup state without MCP protocol objects', async () => {
    const state = await getSetupState(config, {
      claude: false,
      gemini: false,
      antigravity: false,
      codex: true,
      opencode: false,
    });

    expect(state.configStatus).toBe('loaded');
    expect(state.configuredAgents).toEqual([
      expect.objectContaining({
        agent: 'codex',
        runner: 'codex',
        model: 'fake-codex',
      }),
    ]);
    expect(state.runnerDiscovery.map((runner) => runner.runner)).toEqual([
      'claude',
      'gemini',
      'antigravity',
      'codex',
      'opencode',
    ]);
    expect(JSON.stringify(state)).not.toContain('mcp');
  });

  it('lists configured agents with safe model fallback', async () => {
    vi.mocked(executeCommand).mockResolvedValue('not json');

    const result = await listSidekickAgents(config, {
      claude: false,
      gemini: false,
      antigravity: false,
      codex: true,
      opencode: false,
    }) as { agents: Array<{ agent: string; models: string[] }> };

    expect(result.agents[0].agent).toBe('codex');
    expect(result.agents[0].models).toEqual([
      'gpt-5.5',
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-5.3-codex',
    ]);
  });

  it('runs one configured agent through the task coordinator', async () => {
    vi.mocked(executeCommand).mockResolvedValue(JSON.stringify({
      type: 'item.completed',
      item: { type: 'agent_message', text: 'core answer' },
    }));

    const result = await runSidekickAgent(config, {
      agentName: 'codex',
      prompt: 'answer from core',
      mode: 'read-only',
      worktree: 'off',
      cwd: config.sidekickHome,
    }) as {
      status: string;
      answer: string;
      worktree: { kind: string };
      logs: { stdout: string };
      stdout?: string;
    };

    expect(result.status).toBe('completed');
    expect(result.answer).toBe('core answer');
    expect(result.worktree.kind).toBe('none');
    expect(result.logs.stdout).toContain(config.taskRootDir);
    expect(result).not.toHaveProperty('stdout');
    expect(executeCommand).toHaveBeenCalledWith(
      'codex',
      expect.arrayContaining(['exec', '--json']),
      expect.objectContaining({ cwd: config.sidekickHome }),
    );
    const options = vi.mocked(executeCommand).mock.calls.at(-1)?.[2];
    expect(options?.timeoutMs).toBeUndefined();
  });

  it('writes an ATIF trajectory when requested', async () => {
    vi.mocked(executeCommand).mockResolvedValue(JSON.stringify({
      type: 'item.completed',
      item: { type: 'agent_message', text: 'trajectory answer' },
    }));

    const result = await runSidekickAgent(config, {
      agentName: 'codex',
      prompt: 'record this trajectory',
      mode: 'read-only',
      worktree: 'off',
      cwd: config.sidekickHome,
      trajectory: true,
    }) as {
      taskId: string;
      answer: string;
      logs: { trajectory: string; result: string };
    };

    expect(result.answer).toBe('trajectory answer');
    expect(result.logs.trajectory).toBe(path.join(config.taskRootDir, result.taskId, 'trajectory.json'));
    expect(existsSync(result.logs.trajectory)).toBe(true);
    const trajectory = JSON.parse(readFileSync(result.logs.trajectory, 'utf8')) as {
      schema_version: string;
      session_id: string;
      steps: Array<{ source: string; message: string }>;
    };
    expect(trajectory.schema_version).toBe('ATIF-v1.7');
    expect(trajectory.session_id).toBe(result.taskId);
    expect(trajectory.steps[0]).toEqual(expect.objectContaining({
      source: 'user',
      message: 'record this trajectory',
    }));
    expect(trajectory.steps.at(-1)).toEqual(expect.objectContaining({
      source: 'agent',
      message: 'trajectory answer',
    }));
    expect(JSON.parse(readFileSync(result.logs.result, 'utf8')).logs.trajectory).toBe(result.logs.trajectory);
  });

  it('resolves explicit trajectory paths against the run cwd', async () => {
    vi.mocked(executeCommand).mockResolvedValue(JSON.stringify({
      type: 'item.completed',
      item: { type: 'agent_message', text: 'explicit trajectory answer' },
    }));

    const result = await runSidekickAgent(config, {
      agentName: 'codex',
      prompt: 'record explicit trajectory',
      mode: 'read-only',
      worktree: 'off',
      cwd: config.sidekickHome,
      trajectory: 'debug/trajectory.json',
    }) as {
      logs: { trajectory: string };
    };

    expect(result.logs.trajectory).toBe(path.join(config.sidekickHome, 'debug', 'trajectory.json'));
    expect(existsSync(result.logs.trajectory)).toBe(true);
  });

  it('cleans up through recorded worktree metadata only', async () => {
    const metadataStore = new TaskMetadataStore(config.taskRootDir);
    await metadataStore.create({
      taskId: 'task-1',
      status: 'completed',
      agent: 'codex',
      runner: 'codex',
      model: 'fake-codex',
      mode: 'edit',
      baseCwd: config.sidekickHome,
      worktree: {
        id: 'sidekick-task-codex',
        kind: 'managed',
        cwd: path.join(config.sidekickHome, 'wt'),
        path: path.join(config.sidekickHome, 'wt'),
      },
    });
    vi.mocked(executeCommand)
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('removed');

    await expect(cleanupSidekickWorktree(config, { taskId: 'task-1' }))
      .resolves.toContain('Removed Sidekick worktree');
    expect(executeCommand).toHaveBeenCalledWith(
      'git',
      ['status', '--porcelain'],
      expect.objectContaining({ cwd: path.join(config.sidekickHome, 'wt') }),
    );
  });
});
