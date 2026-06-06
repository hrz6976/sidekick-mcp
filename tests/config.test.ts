import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

describe('config', () => {
  it('uses Sidekick home and marks setup required when config is missing', () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'sidekick-config-missing-'));
    try {
      const config = loadConfig({ SIDEKICK_HOME: home });

      expect(config.sidekickHome).toBe(home);
      expect(config.configPath).toBe(path.join(home, 'config.json'));
      expect(config.taskRootDir).toBe(path.join(home, 'tasks'));
      expect(config.worktreeRootDir).toBe(path.join(home, 'worktrees'));
      expect(config.logPath).toBe(path.join(home, 'logs', 'sidekick.log'));
      expect(config.setupRequired).toBe(true);
      expect(config.userConfig).toBeUndefined();
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('loads a JSON config from SIDEKICK_CONFIG_PATH', () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'sidekick-config-'));
    const configPath = path.join(home, 'custom.json');
    writeFileSync(configPath, JSON.stringify({
      agents: {
        deepseek: {
          runner: 'opencode',
          command: 'opencode-dev',
          model: 'deepseek/deepseek-chat',
          effort: 'high',
          extraArgs: [],
          description: 'DeepSeek through OpenCode',
        },
      },
      defaults: { mode: 'edit', worktree: 'auto' },
    }), 'utf8');

    try {
      const config = loadConfig({
        SIDEKICK_HOME: home,
        SIDEKICK_CONFIG_PATH: configPath,
      });

      expect(config.setupRequired).toBe(false);
      expect(config.configPath).toBe(configPath);
      expect(config.userConfig?.agents.deepseek?.runner).toBe('opencode');
      expect(config.userConfig?.agents.deepseek?.command).toBe('opencode-dev');
      expect(config.userConfig?.agents.deepseek?.model).toBe('deepseek/deepseek-chat');
      expect(config.userConfig?.agents.deepseek?.effort).toBe('high');
      expect(config.userConfig?.agents.deepseek?.extraArgs).toEqual([]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('accepts legacy reasoningEffort as an alias for config effort', () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'sidekick-config-legacy-effort-'));
    const configPath = path.join(home, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      agents: {
        deepseek: {
          runner: 'opencode',
          model: 'deepseek/deepseek-chat',
          reasoningEffort: 'high',
          extraArgs: [],
        },
      },
      defaults: { mode: 'edit', worktree: 'auto' },
    }), 'utf8');

    try {
      const config = loadConfig({
        SIDEKICK_HOME: home,
        SIDEKICK_CONFIG_PATH: configPath,
      });

      expect(config.userConfig?.agents.deepseek?.effort).toBe('high');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('defaults runner aliases to matching commands', () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'sidekick-config-runner-'));
    const configPath = path.join(home, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      agents: {
        gemini: { model: 'gemini-2.5-pro' },
      },
      defaults: { mode: 'read-only', worktree: 'auto' },
    }), 'utf8');

    try {
      const config = loadConfig({
        SIDEKICK_HOME: home,
        SIDEKICK_CONFIG_PATH: configPath,
      });

      expect(config.setupRequired).toBe(false);
      expect(config.userConfig?.agents.gemini?.runner).toBe('gemini');
      expect(config.userConfig?.agents.gemini?.command).toBe('gemini');
      expect(config.userConfig?.agents.gemini?.enabled).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('parses Sidekick logging environment overrides', () => {
    const config = loadConfig({
      SIDEKICK_LOG_LEVEL: 'info',
      SIDEKICK_STDERR_LOG_LEVEL: 'silent',
    });

    expect(config.logLevel).toBe('info');
    expect(config.stderrLogLevel).toBe('silent');
  });

  it('does not read legacy MULTICLI environment variables', () => {
    const config = loadConfig({
      MULTICLI_TRANSPORT: 'http',
      MULTICLI_LOG_PATH: '/tmp/legacy.log',
      MULTICLI_HTTP_AUTH_TOKEN: 'legacy-token',
    });

    expect(config.logPath).not.toBe('/tmp/legacy.log');
  });
});
