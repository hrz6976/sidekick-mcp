import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/utils/cliDetector.js', () => ({
  detectAvailableClis: vi.fn(),
}));

import type { SidekickConfig } from '../../src/config.js';
import { initTools } from '../../src/tools/index.js';
import { getToolDefinitions, toolRegistry } from '../../src/tools/registry.js';
import { detectAvailableClis } from '../../src/utils/cliDetector.js';

function createConfig(overrides: Partial<SidekickConfig> = {}): SidekickConfig {
  const home = path.join(os.tmpdir(), `sidekick-tools-${process.pid}`);
  return {
    transport: 'stdio',
    cliDetectTimeoutMs: 100,
    killGraceMs: 50,
    taskTtlMs: 60_000,
    taskPollIntervalMs: 5,
    progressIdleHeartbeatMs: 25,
    progressThrottleMs: 1,
    httpHost: '127.0.0.1',
    httpPort: 37420,
    httpPath: '/mcp',
    httpSessionIdleMs: 60_000,
    logPath: path.join(home, 'logs', 'sidekick.log'),
    logLevel: 'debug',
    stderrLogLevel: 'silent',
    sidekickHome: home,
    configPath: path.join(home, 'config.json'),
    taskRootDir: path.join(home, 'tasks'),
    worktreeRootDir: path.join(home, 'worktrees'),
    serviceRootDir: path.join(home, 'service'),
    serviceLogPath: path.join(home, 'service', 'logs', 'service.log'),
    serviceEnvPath: path.join(home, 'service', 'env'),
    serviceManifestPath: path.join(home, 'service', 'manifest.json'),
    setupRequired: false,
    userConfig: {
      agents: {
        deepseek: {
          runner: 'opencode',
          enabled: true,
          command: 'opencode',
          model: 'deepseek/deepseek-chat',
          reasoningEffort: 'high',
          extraArgs: [],
        },
        gemini: {
          runner: 'gemini',
          enabled: true,
          command: 'gemini',
          model: 'gemini-2.5-pro',
          extraArgs: [],
        },
      },
      defaults: { mode: 'edit', worktree: 'auto' },
    },
    ...overrides,
  };
}

describe('initTools', () => {
  let savedRegistry: typeof toolRegistry extends (infer T)[] ? T[] : never;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(detectAvailableClis).mockResolvedValue({
      gemini: false,
      codex: true,
      claude: false,
      opencode: false,
    });
    savedRegistry = [...toolRegistry];
    toolRegistry.length = 0;
  });

  afterEach(() => {
    toolRegistry.length = 0;
    toolRegistry.push(...savedRegistry);
  });

  it('registers only setup when config is missing', async () => {
    await initTools({
      sidekickConfig: createConfig({ setupRequired: true, userConfig: undefined }),
      cliDetectTimeoutMs: 100,
    });

    expect(toolRegistry.map((tool) => tool.name)).toEqual(['setup']);
    expect(getToolDefinitions()[0].annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    });
  });

  it('registers the configured Sidekick tool surface regardless of CLI availability', async () => {
    vi.mocked(detectAvailableClis).mockResolvedValue({
      gemini: false,
      codex: false,
      claude: false,
      opencode: false,
    });

    const availability = await initTools({
      sidekickConfig: createConfig(),
      cliDetectTimeoutMs: 100,
    });

    expect(availability).toEqual({
      gemini: false,
      codex: false,
      claude: false,
      opencode: false,
    });
    expect(toolRegistry.map((tool) => tool.name)).toEqual([
      'setup',
      'ask_deepseek',
      'ask_gemini',
      'list_agents',
      'cleanup_worktree',
    ]);
  });

  it('marks ask tools task-optional and cleanup destructive', async () => {
    await initTools({
      sidekickConfig: createConfig(),
      cliDetectTimeoutMs: 100,
    });

    const definitions = getToolDefinitions();
    const askDeepseek = definitions.find((tool) => tool.name === 'ask_deepseek');
    const cleanup = definitions.find((tool) => tool.name === 'cleanup_worktree');

    expect(askDeepseek?.execution).toEqual({ taskSupport: 'optional' });
    expect(askDeepseek?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    });
    expect(cleanup?.annotations?.destructiveHint).toBe(true);
  });
});
