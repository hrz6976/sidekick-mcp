#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig, type SidekickMode, type WorktreeMode } from './config.js';
import { createLogger } from './logger.js';
import { getRunnerAdapters } from './runners/registry.js';
import { getSetupState, formatSetupPrompt, listSidekickAgents, runSidekickAgent, cleanupSidekickWorktree } from './core/index.js';
import { TaskMetadataStore } from './tasks/metadataStore.js';
import { detectAvailableClis } from './utils/cliDetector.js';

type CliCommand = 'setup' | 'list' | 'run' | 'cleanup' | 'help';

export interface ParsedCliArgs {
  command: CliCommand;
  json: boolean;
  agent?: string;
  prompt?: string;
  promptFile?: string;
  cwd?: string;
  mode?: SidekickMode;
  worktree?: WorktreeMode;
  effort?: string;
  trajectory?: boolean | string;
  taskId?: string;
  worktreeId?: string;
  force?: boolean;
  progress: boolean;
}

const VALID_MODES = new Set<SidekickMode>(['read-only', 'edit', 'full-access']);
const VALID_WORKTREES = new Set<WorktreeMode>(['auto', 'off']);

function usage(): string {
  return [
    'Usage:',
    '  sidekick setup [--json]',
    '  sidekick list [--json]',
    '  sidekick run --agent <name> (--prompt-file <path> | --prompt <text>) [--cwd <path>] [--mode read-only|edit|full-access] [--worktree auto|off] [--effort <value>] [--trajectory [path]] [--no-progress] [--json]',
    '  sidekick cleanup (--task-id <id> | --worktree-id <id>) [--force] [--json]',
  ].join('\n');
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function parseMode(value: string): SidekickMode {
  if (!VALID_MODES.has(value as SidekickMode)) {
    throw new Error(`Invalid --mode "${value}". Expected read-only, edit, or full-access.`);
  }
  return value as SidekickMode;
}

function parseWorktree(value: string): WorktreeMode {
  if (!VALID_WORKTREES.has(value as WorktreeMode)) {
    throw new Error(`Invalid --worktree "${value}". Expected auto or off.`);
  }
  return value as WorktreeMode;
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const [rawCommand, ...rest] = argv;
  const command = rawCommand === undefined || rawCommand === 'help' || rawCommand === '--help' || rawCommand === '-h'
    ? 'help'
    : rawCommand;

  if (command !== 'setup' && command !== 'list' && command !== 'run' && command !== 'cleanup' && command !== 'help') {
    throw new Error(`Unknown command "${command}".\n${usage()}`);
  }

  const parsed: ParsedCliArgs = {
    command,
    json: false,
    progress: true,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    switch (arg) {
      case '--json':
        parsed.json = true;
        break;
      case '--agent':
        parsed.agent = requireValue(rest, index, arg);
        index += 1;
        break;
      case '--prompt':
        parsed.prompt = requireValue(rest, index, arg);
        index += 1;
        break;
      case '--prompt-file':
        parsed.promptFile = requireValue(rest, index, arg);
        index += 1;
        break;
      case '--cwd':
        parsed.cwd = requireValue(rest, index, arg);
        index += 1;
        break;
      case '--mode':
        parsed.mode = parseMode(requireValue(rest, index, arg));
        index += 1;
        break;
      case '--worktree':
        parsed.worktree = parseWorktree(requireValue(rest, index, arg));
        index += 1;
        break;
      case '--effort':
        parsed.effort = requireValue(rest, index, arg);
        index += 1;
        break;
      case '--trajectory':
        if (rest[index + 1] && !rest[index + 1].startsWith('--')) {
          parsed.trajectory = rest[index + 1];
          index += 1;
        } else {
          parsed.trajectory = true;
        }
        break;
      case '--task-id':
        parsed.taskId = requireValue(rest, index, arg);
        index += 1;
        break;
      case '--worktree-id':
        parsed.worktreeId = requireValue(rest, index, arg);
        index += 1;
        break;
      case '--force':
        parsed.force = true;
        break;
      case '--no-progress':
        parsed.progress = false;
        break;
      default:
        if (arg.startsWith('--trajectory=')) {
          const value = arg.slice('--trajectory='.length);
          if (!value) {
            throw new Error('Missing value for --trajectory=.');
          }
          parsed.trajectory = value;
          break;
        }
        throw new Error(`Unknown option "${arg}".`);
    }
  }

  if (parsed.command === 'run') {
    if (!parsed.agent) {
      throw new Error('run requires --agent <name>.');
    }
    if (parsed.prompt && parsed.promptFile) {
      throw new Error('run accepts either --prompt or --prompt-file, not both.');
    }
    if (!parsed.prompt && !parsed.promptFile) {
      throw new Error('run requires --prompt-file <path> or --prompt <text>.');
    }
  }

  if (parsed.command === 'cleanup' && !parsed.taskId && !parsed.worktreeId) {
    throw new Error('cleanup requires --task-id <id> or --worktree-id <id>.');
  }

  return parsed;
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function writeErrorText(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(`!!! ERROR OCCURRED !!!\n${message}\n`);
}

function extractAnswer(result: unknown): string {
  if (result && typeof result === 'object' && 'answer' in result) {
    const answer = (result as { answer?: unknown }).answer;
    return typeof answer === 'string' ? answer : String(answer ?? '');
  }
  return '';
}

function extractTrajectoryPath(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') {
    return undefined;
  }
  const logs = (result as { logs?: unknown }).logs;
  if (!logs || typeof logs !== 'object') {
    return undefined;
  }
  const trajectory = (logs as { trajectory?: unknown }).trajectory;
  return typeof trajectory === 'string' ? trajectory : undefined;
}

function writeProgressLine(message: string): void {
  for (const line of message.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) {
      process.stderr.write(`[sidekick] ${trimmed}\n`);
    }
  }
}

async function readPrompt(parsed: ParsedCliArgs): Promise<string> {
  if (parsed.prompt !== undefined) {
    return parsed.prompt;
  }
  if (!parsed.promptFile) {
    throw new Error('Missing prompt.');
  }
  const resolved = path.resolve(parsed.cwd ?? process.cwd(), parsed.promptFile);
  return fs.readFile(resolved, 'utf8');
}

async function execute(parsed: ParsedCliArgs): Promise<void> {
  if (parsed.command === 'help') {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const config = loadConfig();
  const rootLogger = createLogger({
    filePath: config.logPath,
    fileLevel: config.logLevel,
    stderrLevel: config.stderrLogLevel,
    bindings: { component: 'sidekick' },
  });
  const logger = rootLogger.child({ component: 'cli' });
  logger.info('cli_started', {
    command: parsed.command,
    cwd: process.cwd(),
    nodeVersion: process.version,
    platform: process.platform,
  });

  const context = {
    cwd: parsed.cwd ? path.resolve(parsed.cwd) : process.cwd(),
    env: process.env,
    logger,
  };

  if (parsed.command === 'setup' || parsed.command === 'list') {
    const availability = await detectAvailableClis(
      getRunnerAdapters(),
      config.cliDetectTimeoutMs,
      rootLogger.child({ component: 'cliDetector' }),
    );

    if (parsed.command === 'setup') {
      const state = await getSetupState(config, availability, context);
      if (parsed.json) {
        writeJson(state);
      } else {
        process.stdout.write(`${formatSetupPrompt(state)}\n`);
      }
      return;
    }

    writeJson(await listSidekickAgents(config, availability, context));
    return;
  }

  await new TaskMetadataStore(config.taskRootDir).markInterruptedRunningTasks();

  if (parsed.command === 'run') {
    const prompt = await readPrompt(parsed);
    const reportProgress = parsed.progress
      ? (message: string) => writeProgressLine(message)
      : undefined;
    reportProgress?.(`Starting ${parsed.agent}`);
    let result: unknown;
    try {
      result = await runSidekickAgent(config, {
        agentName: parsed.agent!,
        prompt,
        mode: parsed.mode,
        worktree: parsed.worktree,
        effort: parsed.effort,
        cwd: context.cwd,
        env: process.env,
        logger,
        onProgress: reportProgress,
        trajectory: parsed.trajectory,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reportProgress?.(`Failed ${parsed.agent}: ${message}`);
      throw error;
    }
    const trajectoryPath = extractTrajectoryPath(result);
    if (trajectoryPath) {
      reportProgress?.(`Trajectory written: ${trajectoryPath}`);
    }
    reportProgress?.(`Completed ${parsed.agent}`);
    if (parsed.json) {
      writeJson(result);
    } else {
      process.stdout.write(`${extractAnswer(result)}\n`);
    }
    return;
  }

  const result = await cleanupSidekickWorktree(config, {
    taskId: parsed.taskId,
    worktreeId: parsed.worktreeId,
    force: parsed.force,
  }, context);
  writeJson({ result });
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseCliArgs(argv);
  await execute(parsed);
}

function realpathOrResolve(filePath: string): string {
  try {
    return realpathSync(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

export function isDirectCliEntrypoint(importMetaUrl: string, argvPath: string | undefined): boolean {
  if (!argvPath) {
    return false;
  }
  return realpathOrResolve(fileURLToPath(importMetaUrl)) === realpathOrResolve(argvPath);
}

if (isDirectCliEntrypoint(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    if (process.argv.slice(2).includes('--json')) {
      const message = error instanceof Error ? error.message : String(error);
      writeJson({ error: message });
    } else {
      writeErrorText(error);
    }
    process.exit(1);
  });
}
