import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const isWindows = process.platform === 'win32';

function cleanupRoot(root) {
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    console.error(`Preserved CLI E2E temp dir because cleanup failed: ${root}`);
    console.error(error);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error([
      `Command failed: ${command} ${args.join(' ')}`,
      `status: ${result.status}`,
      `stdout: ${result.stdout}`,
      `stderr: ${result.stderr}`,
    ].join('\n'));
  }
  return result.stdout.trim();
}

function makeFakeCommand(root) {
  const fakeAgent = path.join(root, 'fake-agent.mjs');
  writeFileSync(fakeAgent, `#!/usr/bin/env node
const args = process.argv.slice(2);
const prompt = args[args.length - 1] || '';
if (prompt.includes('SIDEKICK_COMMAND_FAKE_AGENT_FAIL')) {
  console.log(JSON.stringify({ type: 'item.completed', item: { id: 'item_fail', type: 'agent_message', text: 'partial failure answer' } }));
  console.error('fake agent failed intentionally');
  process.exit(1);
}
if (args.includes('--print')) {
  console.log('fake antigravity answer');
  process.exit(0);
}
if (args.includes('exec')) {
  console.log(JSON.stringify({ type: 'item.completed', item: { id: 'item_1', type: 'agent_message', text: 'fake codex cli answer' } }));
}
console.log(JSON.stringify({
  ok: true,
  marker: 'SIDEKICK_COMMAND_FAKE_AGENT_OK',
  cwd: process.cwd(),
  args
}));
`, 'utf8');
  chmodSync(fakeAgent, 0o700);

  if (isWindows) {
    const cmd = path.join(root, 'fake-agent.cmd');
    writeFileSync(cmd, `@echo off\r\nnode "%~dp0fake-agent.mjs" %*\r\n`, 'utf8');
    return cmd;
  }

  const sh = path.join(root, 'fake-agent');
  writeFileSync(sh, `#!/usr/bin/env sh\nnode "${fakeAgent}" "$@"\n`, 'utf8');
  chmodSync(sh, 0o700);
  return sh;
}

function makeGitRepo(root) {
  const repo = path.join(root, 'repo');
  run('git', ['init', repo]);
  run('git', ['config', 'user.email', 'sidekick-e2e@example.test'], { cwd: repo });
  run('git', ['config', 'user.name', 'Sidekick CLI E2E'], { cwd: repo });
  writeFileSync(path.join(repo, 'README.md'), '# sidekick cli e2e\n', 'utf8');
  run('git', ['add', 'README.md'], { cwd: repo });
  run('git', ['commit', '-m', 'init'], { cwd: repo });
  return repo;
}

function cli(args, env, cwd) {
  return run(process.execPath, [path.join(repoRoot, 'dist', 'sidekick.mjs'), ...args], {
    cwd,
    env: {
      ...process.env,
      ...env,
      SIDEKICK_STDERR_LOG_LEVEL: 'silent',
    },
  });
}

function sidekick(args, env, cwd) {
  const result = spawnSync(process.execPath, [path.join(repoRoot, 'dist', 'sidekick.mjs'), ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
      SIDEKICK_STDERR_LOG_LEVEL: 'silent',
    },
  });
  if (result.status !== 0) {
    throw new Error([
      `Command failed: sidekick ${args.join(' ')}`,
      `status: ${result.status}`,
      `stdout: ${result.stdout}`,
      `stderr: ${result.stderr}`,
    ].join('\n'));
  }
  return result;
}

const root = mkdtempSync(path.join(tmpdir(), 'sidekick-e2e-'));
try {
  const fakeCommand = makeFakeCommand(root);
  const repo = makeGitRepo(root);
  const home = path.join(root, 'home');
  mkdirSync(home, { recursive: true });
  writeFileSync(path.join(home, 'config.json'), JSON.stringify({
    agents: {
      codex: {
        runner: 'codex',
        enabled: true,
        command: fakeCommand,
        model: 'fake-codex',
        extraArgs: [],
        description: 'Fake Codex for sidekick CLI e2e.',
      },
      antigravity: {
        runner: 'antigravity',
        enabled: true,
        command: fakeCommand,
        model: 'fake-antigravity',
        extraArgs: [],
        description: 'Fake Antigravity for sidekick CLI e2e.',
      },
    },
    defaults: { mode: 'edit', worktree: 'auto' },
  }, null, 2), 'utf8');
  const promptFile = path.join(root, 'TASK.md');
  writeFileSync(promptFile, '# Ensemble Task\n\nAnswer independently.\n', 'utf8');
  const env = { SIDEKICK_HOME: home };

  const listed = JSON.parse(cli(['list', '--json'], env, repo));
  assert.equal(listed.agents.length, 2);
  assert.equal(listed.agents.find((agent) => agent.agent === 'codex').runner, 'codex');
  assert.equal(listed.agents.find((agent) => agent.agent === 'antigravity').runner, 'antigravity');

  const sidekickLink = path.join(root, 'sidekick-link.mjs');
  symlinkSync(path.join(repoRoot, 'dist', 'sidekick.mjs'), sidekickLink);
  const listedViaSymlink = JSON.parse(run(process.execPath, [sidekickLink, 'list', '--json'], {
    cwd: repo,
    env: {
      ...process.env,
      ...env,
      SIDEKICK_STDERR_LOG_LEVEL: 'silent',
    },
  }));
  assert.equal(listedViaSymlink.agents.length, 2);
  assert.equal(listedViaSymlink.agents.find((agent) => agent.agent === 'codex').runner, 'codex');

  const antigravityRun = sidekick([
    'run',
    '--agent',
    'antigravity',
    '--prompt-file',
    promptFile,
    '--cwd',
    repo,
    '--mode',
    'read-only',
    '--worktree',
    'off',
    '--json',
    '--no-progress',
  ], env, repo);
  const antigravityResult = JSON.parse(antigravityRun.stdout);
  assert.equal(antigravityResult.status, 'completed');
  assert.equal(antigravityResult.agent, 'antigravity');
  assert.equal(antigravityResult.runner, 'antigravity');
  assert.equal(antigravityResult.answer, 'fake antigravity answer');
  assert.equal(antigravityResult.worktree.kind, 'none');
  assert.match(readFileSync(antigravityResult.logs.stdout, 'utf8'), /fake antigravity answer/);

  const runResult = sidekick([
    'run',
    '--agent',
    'codex',
    '--prompt-file',
    promptFile,
    '--cwd',
    repo,
    '--mode',
    'edit',
    '--worktree',
    'auto',
    '--trajectory',
    '--json',
  ], env, repo);
  assert.match(runResult.stderr, /\[sidekick\] Starting codex/);
  assert.match(runResult.stderr, /\[sidekick\] Codex: fake codex cli answer/);
  assert.match(runResult.stderr, /\[sidekick\] Completed codex/);
  const result = JSON.parse(runResult.stdout);

  assert.equal(result.status, 'completed');
  assert.equal(result.agent, 'codex');
  assert.equal(result.runner, 'codex');
  assert.equal(result.answer, 'fake codex cli answer');
  assert.equal('stdout' in result, false);
  assert.ok(result.logs.trajectory);
  assert.equal(result.worktree.kind, 'managed');
  assert.ok(result.worktree.path.startsWith(path.join(home, 'worktrees')));
  assert.ok(existsSync(result.logs.stdout));
  assert.ok(existsSync(result.logs.result));
  assert.ok(existsSync(result.logs.trajectory));
  assert.equal(path.basename(result.logs.trajectory), 'trajectory.json');
  assert.equal(path.dirname(result.logs.trajectory), path.dirname(result.logs.result));
  const defaultTrajectory = JSON.parse(readFileSync(result.logs.trajectory, 'utf8'));
  assert.equal(defaultTrajectory.schema_version, 'ATIF-v1.7');
  assert.equal(defaultTrajectory.session_id, result.taskId);
  assert.equal(defaultTrajectory.steps[0].source, 'user');
  assert.match(defaultTrajectory.steps[0].message, /Answer independently/);
  assert.equal(defaultTrajectory.steps.at(-1).message, 'fake codex cli answer');
  assert.match(readFileSync(result.logs.stdout, 'utf8'), /SIDEKICK_COMMAND_FAKE_AGENT_OK/);
  assert.ok(existsSync(result.worktree.path));

  const explicitTrajectoryPath = path.join(root, 'custom-trajectory.json');
  const humanRun = sidekick([
    'run',
    '--agent',
    'codex',
    '--prompt-file',
    promptFile,
    '--cwd',
    repo,
    '--mode',
    'read-only',
    '--worktree',
    'off',
    '--trajectory',
    explicitTrajectoryPath,
    '--no-progress',
  ], env, repo);
  assert.equal(humanRun.stdout.trim(), 'fake codex cli answer');
  assert.equal(humanRun.stderr, '');
  assert.ok(existsSync(explicitTrajectoryPath));
  const explicitTrajectory = JSON.parse(readFileSync(explicitTrajectoryPath, 'utf8'));
  assert.equal(explicitTrajectory.schema_version, 'ATIF-v1.7');
  assert.equal(explicitTrajectory.extra.status, 'completed');

  const failureTrajectoryPath = path.join(root, 'failure-trajectory.json');
  const failedRun = spawnSync(process.execPath, [
    path.join(repoRoot, 'dist', 'sidekick.mjs'),
    'run',
    '--agent',
    'codex',
    '--prompt',
    'SIDEKICK_COMMAND_FAKE_AGENT_FAIL',
    '--cwd',
    repo,
    '--mode',
    'read-only',
    '--worktree',
    'off',
    '--trajectory',
    failureTrajectoryPath,
    '--no-progress',
  ], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
      SIDEKICK_STDERR_LOG_LEVEL: 'silent',
    },
  });
  assert.equal(failedRun.status, 1);
  assert.match(failedRun.stdout, /^!!! ERROR OCCURRED !!!/);
  assert.ok(existsSync(failureTrajectoryPath));
  const failureTrajectory = JSON.parse(readFileSync(failureTrajectoryPath, 'utf8'));
  assert.equal(failureTrajectory.schema_version, 'ATIF-v1.7');
  assert.equal(failureTrajectory.extra.status, 'failed');
  assert.match(failureTrajectory.steps.at(-1).message, /Sidekick run failed/);

  const errorRun = spawnSync(process.execPath, [
    path.join(repoRoot, 'dist', 'sidekick.mjs'),
    'run',
    '--agent',
    'missing_agent',
    '--prompt',
    'hello',
    '--cwd',
    repo,
    '--mode',
    'read-only',
    '--worktree',
    'off',
    '--no-progress',
  ], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
      SIDEKICK_STDERR_LOG_LEVEL: 'silent',
    },
  });
  assert.equal(errorRun.status, 1);
  assert.match(errorRun.stdout, /^!!! ERROR OCCURRED !!!\r?\nUnknown Sidekick agent "missing_agent"\./);

  const cleanup = JSON.parse(cli([
    'cleanup',
    '--task-id',
    result.taskId,
    '--json',
  ], env, repo));
  assert.match(cleanup.result, /Removed Sidekick worktree/);
  assert.equal(existsSync(result.worktree.path), false);

  console.log('SIDEKICK_COMMAND_E2E_OK');
} finally {
  cleanupRoot(root);
}
