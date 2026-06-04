import os from 'node:os';
import path from 'node:path';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { SidekickConfig } from '../src/config.js';
import { getServiceKind, getServicePaths } from '../src/service/paths.js';
import { loadServiceEnvironment } from '../src/service/bootstrap.js';
import { ensureServiceFilesystem, isMatchingClaudeConfigOutput } from '../src/service/manager.js';
import {
  buildServiceEnvFileContents,
  createServiceManifest,
} from '../src/service/runtime.js';
import {
  renderLaunchAgent,
  renderPosixLauncher,
  renderSystemdUnit,
  renderWindowsLauncher,
  renderWindowsTaskXml,
} from '../src/service/renderers.js';

function createConfig(overrides: Partial<SidekickConfig> = {}): SidekickConfig {
  const sidekickHome = path.join(os.tmpdir(), 'sidekick-service-test');
  const serviceRootDir = path.join(sidekickHome, 'service');

  return {
    transport: 'http',
    cliDetectTimeoutMs: 100,
    killGraceMs: 50,
    taskTtlMs: 60_000,
    taskPollIntervalMs: 5,
    progressIdleHeartbeatMs: 25,
    progressThrottleMs: 1,
    httpHost: '127.0.0.1',
    httpPort: 37420,
    httpPath: '/mcp',
    httpAuthToken: 'token',
    httpSessionIdleMs: 60_000,
    logPath: path.join(serviceRootDir, 'sidekick.log'),
    logLevel: 'debug',
    stderrLogLevel: 'silent',
    sidekickHome,
    configPath: path.join(sidekickHome, 'config.json'),
    taskRootDir: path.join(sidekickHome, 'tasks'),
    worktreeRootDir: path.join(sidekickHome, 'worktrees'),
    serviceRootDir,
    serviceLogPath: path.join(serviceRootDir, 'logs', 'service.log'),
    serviceEnvPath: path.join(serviceRootDir, 'env'),
    serviceManifestPath: path.join(serviceRootDir, 'manifest.json'),
    setupRequired: true,
    ...overrides,
  };
}

describe('service paths', () => {
  it('selects the expected service kind for each platform', () => {
    expect(getServiceKind('darwin')).toBe('launchd');
    expect(getServiceKind('linux')).toBe('systemd-user');
    expect(getServiceKind('win32')).toBe('windows-task');
  });

  it('renders platform-specific service definition paths', () => {
    const config = createConfig();

    expect(getServicePaths(config, 'darwin').serviceDefinition).toContain('LaunchAgents');
    expect(getServicePaths(config, 'linux').serviceDefinition).toContain('systemd/user');
    expect(getServicePaths(config, 'win32').serviceDefinition).toContain('task.xml');
  });

  it('uses a recognizable launcher filename on macOS', () => {
    const config = createConfig();

    expect(path.basename(getServicePaths(config, 'darwin').launcher)).toBe('sidekick.sh');
    expect(path.basename(getServicePaths(config, 'linux').launcher)).toBe('launcher.sh');
  });
});

describe('service runtime', () => {
  it('builds a manifest with the expected transport metadata', () => {
    const manifest = createServiceManifest(createConfig(), 'token-value', 'darwin');

    expect(manifest.transport.url).toBe('http://127.0.0.1:37420/mcp');
    expect(manifest.transport.healthUrl).toBe('http://127.0.0.1:37420/health');
    expect(manifest.transport.token).toBe('token-value');
    expect(manifest.runtime.bootstrapPath).toContain('bootstrap.');
  });

  it('renders a JSON env file with PATH and managed Sidekick variables', () => {
    const manifest = createServiceManifest(createConfig(), 'token-value', 'darwin');
    const contents = buildServiceEnvFileContents(manifest, {
      PATH: '/usr/local/bin:/usr/bin',
      OPENAI_API_KEY: 'secret',
    });

    const parsed = JSON.parse(contents) as Record<string, string>;

    expect(parsed.PATH).toBe('/usr/local/bin:/usr/bin');
    expect(parsed.OPENAI_API_KEY).toBe('secret');
    expect(parsed.SIDEKICK_TRANSPORT).toBe('http');
    expect(parsed.SIDEKICK_HTTP_AUTH_TOKEN).toBe('token-value');
    expect(parsed.SIDEKICK_LOG_PATH).toBe(manifest.paths.logFile);
    expect(parsed.SIDEKICK_SERVICE_MANIFEST_PATH).toBe(manifest.paths.manifest);
    expect(parsed.SIDEKICK_SERVICE_RUNTIME_PATH).toBeUndefined();
  });

  it('loads the JSON env file into process environment entries', () => {
    const envFile = path.join(os.tmpdir(), `sidekick-service-env-${process.pid}.json`);
    writeFileSync(envFile, JSON.stringify({ PATH: '/tmp/bin', SIDEKICK_HTTP_AUTH_TOKEN: 'token-value' }), 'utf8');

    try {
      const env = loadServiceEnvironment(envFile, {});
      expect(env.PATH).toBe('/tmp/bin');
      expect(env.SIDEKICK_HTTP_AUTH_TOKEN).toBe('token-value');
    } finally {
      rmSync(envFile, { force: true });
    }
  });
});

describe('service renderers', () => {
  it('renders a POSIX launcher that boots the service bootstrap', () => {
    const manifest = createServiceManifest(createConfig(), 'token-value', 'darwin');
    const script = renderPosixLauncher(manifest);

    expect(script).toContain(manifest.paths.envFile);
    expect(script).toContain(manifest.runtime.nodePath);
    expect(script).toContain(manifest.runtime.bootstrapPath);
    expect(script).toContain('serve-http');
  });

  it('renders a Windows launcher that boots the service bootstrap', () => {
    const manifest = createServiceManifest(createConfig(), 'token-value', 'win32');
    const script = renderWindowsLauncher(manifest);

    expect(script).toContain(manifest.paths.envFile);
    expect(script).toContain(manifest.runtime.nodePath);
    expect(script).toContain(manifest.runtime.bootstrapPath);
    expect(script).toContain('serve-http');
  });

  it('renders native service definitions for each platform', () => {
    const manifest = createServiceManifest(createConfig(), 'token-value', 'darwin');
    expect(renderLaunchAgent(manifest)).toContain('<key>Label</key>');
    expect(renderSystemdUnit(createServiceManifest(createConfig(), 'token-value', 'linux')))
      .toContain('ExecStart=');
    expect(renderWindowsTaskXml(createServiceManifest(createConfig(), 'token-value', 'win32')))
      .toContain('<LogonTrigger>');
  });

  it('renders systemd unit paths without quoted path values', () => {
    const manifest = createServiceManifest(createConfig({
      serviceRootDir: '/home/example/.config/sidekick',
      serviceLogPath: '/home/example/.config/sidekick/logs/service.log',
      serviceEnvPath: '/home/example/.config/sidekick/env',
      serviceManifestPath: '/home/example/.config/sidekick/manifest.json',
    }), 'token-value', 'linux');
    const unit = renderSystemdUnit(manifest);

    expect(unit).toContain('WorkingDirectory=/home/example/.config/sidekick');
    expect(unit).toContain('ExecStart=/home/example/.config/sidekick/launcher.sh');
    expect(unit).toContain('StandardOutput=append:/home/example/.config/sidekick/logs/service.log');
    expect(unit).toContain('StandardError=append:/home/example/.config/sidekick/logs/service.log.stderr');
    expect(unit).not.toContain('WorkingDirectory="');
    expect(unit).not.toContain('append:"');
  });

  it('escapes systemd unit paths with spaces', () => {
    const manifest = createServiceManifest(createConfig({
      serviceRootDir: '/home/example/Sidekick MCP',
      serviceLogPath: '/home/example/Sidekick MCP/logs/service.log',
      serviceEnvPath: '/home/example/Sidekick MCP/env',
      serviceManifestPath: '/home/example/Sidekick MCP/manifest.json',
    }), 'token-value', 'linux');
    const unit = renderSystemdUnit(manifest);

    expect(unit).toContain('WorkingDirectory=/home/example/Sidekick\\x20MCP');
    expect(unit).toContain('ExecStart=/home/example/Sidekick\\x20MCP/launcher.sh');
    expect(unit).toContain('StandardOutput=append:/home/example/Sidekick\\x20MCP/logs/service.log');
    expect(unit).toContain('StandardError=append:/home/example/Sidekick\\x20MCP/logs/service.log.stderr');
  });

  it('escapes literal percent characters in systemd unit paths', () => {
    const manifest = createServiceManifest(createConfig({
      serviceRootDir: '/home/example/Sidekick%MCP',
      serviceLogPath: '/home/example/Sidekick%MCP/logs/service.log',
      serviceEnvPath: '/home/example/Sidekick%MCP/env',
      serviceManifestPath: '/home/example/Sidekick%MCP/manifest.json',
    }), 'token-value', 'linux');
    const unit = renderSystemdUnit(manifest);

    expect(unit).toContain('WorkingDirectory=/home/example/Sidekick%%MCP');
    expect(unit).toContain('ExecStart=/home/example/Sidekick%%MCP/launcher.sh');
    expect(unit).toContain('StandardOutput=append:/home/example/Sidekick%%MCP/logs/service.log');
    expect(unit).toContain('StandardError=append:/home/example/Sidekick%%MCP/logs/service.log.stderr');
    expect(unit).not.toContain('\\x25');
  });
});

describe('service manager', () => {
  it('creates directories required before systemd starts the service', () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'sidekick-service-fs-'));
    const serviceRootDir = path.join(tempRoot, 'service');
    const manifest = createServiceManifest(createConfig({
      serviceRootDir,
      serviceLogPath: path.join(serviceRootDir, 'logs', 'service.log'),
      serviceEnvPath: path.join(serviceRootDir, 'env'),
      serviceManifestPath: path.join(serviceRootDir, 'manifest.json'),
    }), 'token-value', 'linux');

    try {
      ensureServiceFilesystem(manifest);

      expect(existsSync(manifest.paths.root)).toBe(true);
      expect(existsSync(path.dirname(manifest.paths.logFile))).toBe(true);
      expect(existsSync(path.dirname(manifest.paths.stderrLogFile))).toBe(true);
      expect(existsSync(path.dirname(manifest.paths.serviceDefinition))).toBe(true);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('matches Claude MCP output only for the managed HTTP config', () => {
    const manifest = createServiceManifest(createConfig(), 'token-value', 'darwin');

    const matchingOutput = [
      'Sidekick:',
      '  Scope: User config (available in all your projects)',
      '  Status: ✓ Connected',
      '  Type: http',
      `  URL: ${manifest.transport.url}`,
      '  Headers:',
      `    Authorization: Bearer ${manifest.transport.token}`,
    ].join('\n');

    const stdioOutput = [
      'Sidekick:',
      '  Scope: User config (available in all your projects)',
      '  Status: ✓ Connected',
      '  Type: stdio',
      '  Command: node',
      '  Args: /Users/example/Repos/sidekick-mcp/dist/index.js',
    ].join('\n');

    expect(isMatchingClaudeConfigOutput(matchingOutput, manifest)).toBe(true);
    expect(isMatchingClaudeConfigOutput(stdioOutput, manifest)).toBe(false);
  });
});
