import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

describe('config', () => {
  it('uses Sidekick home and setup-only mode when config is missing', () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'sidekick-config-missing-'));
    try {
      const config = loadConfig({ SIDEKICK_HOME: home });

      expect(config.transport).toBe('stdio');
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
          reasoningEffort: 'high',
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
      expect(config.userConfig?.agents.deepseek?.reasoningEffort).toBe('high');
      expect(config.userConfig?.agents.deepseek?.extraArgs).toEqual([]);
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

  it('parses Sidekick HTTP and service environment overrides', () => {
    const config = loadConfig({
      SIDEKICK_TRANSPORT: 'http',
      SIDEKICK_HTTP_PORT: '40123',
      SIDEKICK_HTTP_PATH: 'custom-mcp',
      SIDEKICK_HTTP_AUTH_TOKEN: 'secret-token',
      SIDEKICK_LOG_LEVEL: 'info',
      SIDEKICK_STDERR_LOG_LEVEL: 'silent',
      SIDEKICK_SERVICE_ROOT_DIR: '/tmp/sidekick-service',
      SIDEKICK_SERVICE_MANIFEST_PATH: '/tmp/sidekick-service/custom-manifest.json',
    });

    expect(config.transport).toBe('http');
    expect(config.httpPort).toBe(40123);
    expect(config.httpPath).toBe('/custom-mcp');
    expect(config.httpAuthToken).toBe('secret-token');
    expect(config.logLevel).toBe('info');
    expect(config.stderrLogLevel).toBe('silent');
    expect(config.serviceRootDir).toBe('/tmp/sidekick-service');
    expect(config.serviceManifestPath).toBe('/tmp/sidekick-service/custom-manifest.json');
  });

  it('does not read legacy MULTICLI environment variables', () => {
    const config = loadConfig({
      MULTICLI_TRANSPORT: 'http',
      MULTICLI_LOG_PATH: '/tmp/legacy.log',
      MULTICLI_HTTP_AUTH_TOKEN: 'legacy-token',
    });

    expect(config.transport).toBe('stdio');
    expect(config.logPath).not.toBe('/tmp/legacy.log');
    expect(config.httpAuthToken).toBeUndefined();
  });
});
