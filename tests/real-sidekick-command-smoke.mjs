import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const agent = process.argv[2] ?? 'claude';
const model = process.argv[3] ?? (agent === 'claude' ? 'sonnet' : '');
const command = process.argv[4] ?? agent;
const marker = 'SIDEKICK_REAL_COMMAND_SMOKE_OK';

function run(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error([
      `Command failed: ${commandName} ${args.join(' ')}`,
      `status: ${result.status}`,
      `stdout: ${result.stdout}`,
      `stderr: ${result.stderr}`,
    ].join('\n'));
  }
  return result.stdout.trim();
}

function dumpDiagnostics(home) {
  console.error(`SIDEKICK_REAL_COMMAND_SMOKE_HOME=${home}`);
  const logPath = path.join(home, 'logs', 'sidekick.log');
  if (existsSync(logPath)) {
    console.error(`--- ${logPath} ---`);
    console.error(readFileSync(logPath, 'utf8'));
  }
  const tasksDir = path.join(home, 'tasks');
  if (existsSync(tasksDir)) {
    for (const taskId of readdirSync(tasksDir)) {
      const taskDir = path.join(tasksDir, taskId);
      for (const fileName of ['metadata.json', 'stdout.log', 'stderr.log', 'result.json', 'trajectory.json']) {
        const filePath = path.join(taskDir, fileName);
        if (existsSync(filePath)) {
          console.error(`--- ${filePath} ---`);
          console.error(readFileSync(filePath, 'utf8'));
        }
      }
    }
  }
}

const root = mkdtempSync(path.join(tmpdir(), 'sidekick-real-cli-smoke-'));
let failed = false;

try {
  const home = path.join(root, 'home');
  const trajectoryPath = path.join(root, 'real-trajectory.json');
  mkdirSync(home, { recursive: true });
  writeFileSync(path.join(home, 'config.json'), JSON.stringify({
    agents: {
      [agent]: {
        runner: agent,
        enabled: true,
        command,
        ...(model ? { model } : {}),
        extraArgs: [],
      },
    },
    defaults: { mode: 'read-only', worktree: 'off' },
  }, null, 2), 'utf8');

  const stdout = run(process.execPath, [
    path.join(repoRoot, 'dist', 'sidekick.mjs'),
    'run',
    '--agent',
    agent,
    '--prompt',
    `Reply with exactly ${marker} and no other text.`,
    '--cwd',
    repoRoot,
    '--mode',
    'read-only',
    '--worktree',
    'off',
    '--trajectory',
    trajectoryPath,
    '--json',
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      SIDEKICK_HOME: home,
      SIDEKICK_STDERR_LOG_LEVEL: 'silent',
    },
  });

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'completed');
  assert.equal(result.agent, agent);
  assert.equal(result.runner, agent);
  assert.match(result.answer, new RegExp(marker));
  assert.equal('stdout' in result, false);
  assert.equal(result.logs.trajectory, trajectoryPath);
  assert.ok(existsSync(trajectoryPath));
  const trajectory = JSON.parse(readFileSync(trajectoryPath, 'utf8'));
  assert.equal(trajectory.schema_version, 'ATIF-v1.7');
  assert.equal(trajectory.session_id, result.taskId);
  assert.equal(trajectory.extra.status, 'completed');
  assert.match(trajectory.steps.at(-1).message, new RegExp(marker));
  console.log(`SIDEKICK_REAL_COMMAND_SMOKE_OK agent=${agent} model=${model}`);
} catch (error) {
  failed = true;
  dumpDiagnostics(path.join(root, 'home'));
  throw error;
} finally {
  if (!failed && !process.env.SIDEKICK_KEEP_REAL_SMOKE) {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } else {
    console.error(`Preserved real CLI smoke temp dir: ${root}`);
  }
}
