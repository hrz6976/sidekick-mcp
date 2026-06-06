import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type SidekickLogLevel = 'error' | 'info' | 'debug';
export type SidekickStderrLogLevel = SidekickLogLevel | 'silent';
export const RUNNER_NAMES = ['claude', 'gemini', 'codex', 'opencode'] as const;
export type RunnerName = typeof RUNNER_NAMES[number];
export type SidekickMode = 'read-only' | 'edit' | 'full-access';
export type WorktreeMode = 'auto' | 'off';

export interface AgentConfig {
  runner: RunnerName;
  enabled: boolean;
  command: string;
  model?: string;
  effort?: string;
  extraArgs: string[];
  models?: string[];
  description?: string;
}

interface SidekickUserConfig {
  agents: Record<string, AgentConfig>;
  defaults: {
    mode: SidekickMode;
    worktree: WorktreeMode;
  };
}

export interface SidekickConfig {
  cliDetectTimeoutMs: number;
  killGraceMs: number;
  taskTtlMs: number;
  taskPollIntervalMs: number;
  progressIdleHeartbeatMs: number;
  progressThrottleMs: number;
  logPath: string;
  logLevel: SidekickLogLevel;
  stderrLogLevel: SidekickStderrLogLevel;
  sidekickHome: string;
  configPath: string;
  taskRootDir: string;
  worktreeRootDir: string;
  setupRequired: boolean;
  configError?: string;
  userConfig?: SidekickUserConfig;
}

function getDefaultSidekickHome(): string {
  return path.join(os.homedir(), '.sidekick');
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseString(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function parseLogLevel(value: string | undefined, fallback: SidekickLogLevel): SidekickLogLevel {
  return value === 'error' || value === 'info' || value === 'debug' ? value : fallback;
}

function parseStderrLogLevel(
  value: string | undefined,
  fallback: SidekickStderrLogLevel,
): SidekickStderrLogLevel {
  return value === 'error' || value === 'info' || value === 'debug' || value === 'silent'
    ? value
    : fallback;
}

function isRunnerName(value: unknown): value is RunnerName {
  return typeof value === 'string' && RUNNER_NAMES.includes(value as RunnerName);
}

function isMode(value: unknown): value is SidekickMode {
  return value === 'read-only' || value === 'edit' || value === 'full-access';
}

function isWorktreeMode(value: unknown): value is WorktreeMode {
  return value === 'auto' || value === 'off';
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function isAgentAlias(value: string): boolean {
  return /^[a-z][a-z0-9_]{0,63}$/.test(value);
}

function parseAgentConfig(alias: string, raw: unknown): AgentConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Sidekick config field "agents.${alias}" must be an object.`);
  }

  const record = raw as Record<string, unknown>;
  const runner = isRunnerName(record.runner)
    ? record.runner
    : isRunnerName(alias)
      ? alias
      : undefined;
  if (!runner) {
    throw new Error(
      `Sidekick config field "agents.${alias}.runner" must be one of claude, gemini, codex, opencode.`,
    );
  }

  return {
    runner,
    enabled: record.enabled !== false,
    command: typeof record.command === 'string' && record.command.trim()
      ? record.command.trim()
      : runner,
    model: typeof record.model === 'string' && record.model.trim()
      ? record.model.trim()
      : undefined,
    effort: typeof record.effort === 'string' && record.effort.trim()
      ? record.effort.trim()
      : typeof record.reasoningEffort === 'string' && record.reasoningEffort.trim()
        ? record.reasoningEffort.trim()
      : undefined,
    extraArgs: parseStringArray(record.extraArgs),
    models: parseStringArray(record.models),
    description: typeof record.description === 'string' && record.description.trim()
      ? record.description.trim()
      : undefined,
  };
}

function parseSidekickUserConfig(raw: unknown): SidekickUserConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Sidekick config must be a JSON object.');
  }

  const record = raw as Record<string, unknown>;
  const rawDefaults = record.defaults && typeof record.defaults === 'object'
    ? record.defaults as Record<string, unknown>
    : {};
  const rawAgents = record.agents && typeof record.agents === 'object'
    ? record.agents as Record<string, unknown>
    : undefined;
  if (!rawAgents) {
    throw new Error('Sidekick config field "agents" must be an object.');
  }

  const agents: Record<string, AgentConfig> = {};
  for (const [alias, rawAgentConfig] of Object.entries(rawAgents)) {
    if (!isAgentAlias(alias)) {
      throw new Error(
        `Sidekick agent name "${alias}" is invalid. Use snake_case names matching [a-z][a-z0-9_]{0,63}.`,
      );
    }
    agents[alias] = parseAgentConfig(alias, rawAgentConfig);
  }
  if (Object.keys(agents).length === 0) {
    throw new Error('Sidekick config field "agents" must define at least one agent.');
  }

  return {
    agents,
    defaults: {
      mode: isMode(rawDefaults.mode) ? rawDefaults.mode : 'edit',
      worktree: isWorktreeMode(rawDefaults.worktree) ? rawDefaults.worktree : 'auto',
    },
  };
}

function readUserConfig(configPath: string): {
  setupRequired: boolean;
  userConfig?: SidekickUserConfig;
  configError?: string;
} {
  if (!fs.existsSync(configPath)) {
    return { setupRequired: true };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as unknown;
    return {
      setupRequired: false,
      userConfig: parseSidekickUserConfig(raw),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      setupRequired: true,
      configError: `Could not load Sidekick config at ${configPath}: ${message}`,
    };
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): SidekickConfig {
  const sidekickHome = parseString(env.SIDEKICK_HOME, getDefaultSidekickHome());
  const configPath = parseString(
    env.SIDEKICK_CONFIG_PATH,
    path.join(sidekickHome, 'config.json'),
  );
  const userConfigState = readUserConfig(configPath);

  return {
    cliDetectTimeoutMs: parsePositiveInt(env.SIDEKICK_CLI_DETECT_TIMEOUT_MS, 5_000),
    killGraceMs: parsePositiveInt(env.SIDEKICK_KILL_GRACE_MS, 5_000),
    taskTtlMs: parsePositiveInt(env.SIDEKICK_TASK_TTL_MS, 60 * 60 * 1000),
    taskPollIntervalMs: parsePositiveInt(env.SIDEKICK_TASK_POLL_INTERVAL_MS, 1_000),
    progressIdleHeartbeatMs: parsePositiveInt(env.SIDEKICK_PROGRESS_IDLE_HEARTBEAT_MS, 10_000),
    progressThrottleMs: parsePositiveInt(env.SIDEKICK_PROGRESS_THROTTLE_MS, 1_000),
    logPath: parseString(env.SIDEKICK_LOG_PATH, path.join(sidekickHome, 'logs', 'sidekick.log')),
    logLevel: parseLogLevel(env.SIDEKICK_LOG_LEVEL, 'debug'),
    stderrLogLevel: parseStderrLogLevel(env.SIDEKICK_STDERR_LOG_LEVEL, 'error'),
    sidekickHome,
    configPath,
    taskRootDir: path.join(sidekickHome, 'tasks'),
    worktreeRootDir: path.join(sidekickHome, 'worktrees'),
    ...userConfigState,
  };
}
