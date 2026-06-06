import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema, ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const isWindows = process.platform === 'win32';

function cleanupRoot(root) {
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    console.error(`Preserved E2E temp dir because cleanup failed: ${root}`);
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

function makeFakeCli(root) {
  const fakeCliModule = path.join(root, 'fake-agent.mjs');
  writeFileSync(fakeCliModule, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.includes('--prompt')) {
  console.log(JSON.stringify({ type: 'message', role: 'assistant', content: 'fake gemini progress', delta: true }));
} else if (args.includes('--print')) {
  console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'fake claude progress' }] } }));
} else if (args.includes('exec')) {
  console.log(JSON.stringify({ type: 'item.completed', item: { id: 'item_1', type: 'agent_message', text: 'fake codex progress' } }));
} else if (args.includes('run')) {
  console.log(JSON.stringify({ type: 'text', part: { type: 'text', text: 'fake opencode progress' } }));
}
const payload = {
  ok: true,
  marker: 'SIDEKICK_FAKE_AGENT_OK',
  cwd: process.cwd(),
  args
};
console.log(JSON.stringify(payload));
`, 'utf8');
  chmodSync(fakeCliModule, 0o700);

  if (isWindows) {
    const fakeCli = path.join(root, 'fake-agent.cmd');
    writeFileSync(fakeCli, `@echo off\r\nnode "%~dp0fake-agent.mjs" %*\r\n`, 'utf8');
    return fakeCli;
  }

  const fakeCli = path.join(root, 'fake-agent');
  writeFileSync(fakeCli, `#!/usr/bin/env sh\nnode "${fakeCliModule}" "$@"\n`, 'utf8');
  chmodSync(fakeCli, 0o700);
  return fakeCli;
}

function makeGitRepo(root) {
  const repo = path.join(root, 'repo');
  run('git', ['init', repo]);
  run('git', ['config', 'user.email', 'sidekick-e2e@example.test'], { cwd: repo });
  run('git', ['config', 'user.name', 'Sidekick E2E'], { cwd: repo });
  writeFileSync(path.join(repo, 'README.md'), '# e2e\n', 'utf8');
  run('git', ['add', 'README.md'], { cwd: repo });
  run('git', ['commit', '-m', 'init'], { cwd: repo });
  return repo;
}

async function connect(home, cwd) {
  const client = new Client(
    { name: 'sidekick-e2e-client', version: '1.0.0' },
    {
      capabilities: {
        roots: {},
        tasks: {
          list: {},
          cancel: {},
        },
      },
    },
  );
  client.setRequestHandler(ListRootsRequestSchema, async () => ({
    roots: [{ uri: `file://${cwd}` }],
  }));
  const stderrChunks = [];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, 'dist', 'index.js')],
    cwd,
    env: {
      ...process.env,
      SIDEKICK_HOME: home,
      SIDEKICK_STDERR_LOG_LEVEL: 'silent',
    },
    stderr: 'pipe',
  });
  transport.stderr?.on('data', (chunk) => {
    stderrChunks.push(String(chunk));
  });
  await client.connect(transport);
  return { client, transport, stderrChunks };
}

async function collectTask(client, request) {
  await client.listTools();
  const messages = [];
  for await (const message of client.experimental.tasks.callToolStream(request, CallToolResultSchema)) {
    messages.push(message);
  }
  const taskCreated = messages.find((message) => message.type === 'taskCreated');
  const resultMessage = messages.find((message) => message.type === 'result');
  assert.ok(taskCreated, 'task stream should include taskCreated');
  assert.ok(resultMessage, 'task stream should include result');
  assert.equal(resultMessage.result.isError, false);
  return JSON.parse(resultMessage.result.content[0].text);
}

const root = mkdtempSync(path.join(tmpdir(), 'sidekick-e2e-'));
try {
  const fakeCli = makeFakeCli(root);
  const repo = makeGitRepo(root);
  const home = path.join(root, 'home');

  {
    const { client, transport } = await connect(home, repo);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name), [
      'setup',
      'list_agents',
      'cleanup_worktree',
    ]);
    const setup = await client.callTool({ name: 'setup', arguments: {} }, CallToolResultSchema);
    assert.equal(setup.isError, false);
    assert.match(setup.content[0].text, /~\/\.sidekick\/config\.json|config\.json/);
    assert.match(setup.content[0].text, /ask_<key>/);
    assert.match(setup.content[0].text, /AskUserQuestion/);
    assert.match(setup.content[0].text, /opencode\//);
    assert.match(setup.content[0].text, /read-only/);
    assert.match(setup.content[0].text, /worktree/);
    const missingAgents = await client.callTool({ name: 'list_agents', arguments: {} }, CallToolResultSchema);
    assert.equal(missingAgents.isError, false);
    assert.match(missingAgents.content[0].text, /Call setup/);
    await client.close();
    await transport.close();
  }

  mkdirSync(home, { recursive: true });
  writeFileSync(path.join(home, 'config.json'), JSON.stringify({
    agents: {
      claude: { runner: 'claude', enabled: true, command: fakeCli, model: 'fake-claude', extraArgs: [] },
      gemini: { runner: 'gemini', enabled: true, command: fakeCli, model: 'fake-gemini', extraArgs: [] },
      codex: { runner: 'codex', enabled: true, command: fakeCli, model: 'fake-codex', extraArgs: [] },
      opencode: { runner: 'opencode', enabled: true, command: fakeCli, model: 'fake-provider/fake-opencode', extraArgs: [] },
    },
    defaults: { mode: 'edit', worktree: 'auto' }
  }, null, 2), 'utf8');

  const { client, transport } = await connect(home, repo);
  try {
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name), [
      'setup',
      'ask_claude',
      'ask_gemini',
      'ask_codex',
      'ask_opencode',
      'list_agents',
      'cleanup_worktree',
    ]);
    assert.deepEqual(
      tools.tools.find((tool) => tool.name === 'ask_claude')?.execution,
      { taskSupport: 'optional' },
    );
    assert.match(
      tools.tools.find((tool) => tool.name === 'ask_claude')?.description ?? '',
      /read-only/,
    );

    const reconfigure = await client.callTool({ name: 'setup', arguments: {} }, CallToolResultSchema);
    assert.equal(reconfigure.isError, false);
    assert.match(reconfigure.content[0].text, /Sidekick is already configured/);
    assert.match(reconfigure.content[0].text, /Current Sidekick discovery/);
    assert.match(reconfigure.content[0].text, /patch it instead of overwriting/);

    const models = await client.callTool({ name: 'list_agents', arguments: {} }, CallToolResultSchema);
    assert.equal(models.isError, false);
    assert.match(models.content[0].text, /fake-claude/);
    assert.match(models.content[0].text, /fake-gemini/);
    assert.match(models.content[0].text, /fake-codex/);
    assert.match(models.content[0].text, /fake-provider\/fake-opencode/);

    const directProgress = [];
    const directGemini = await client.callTool({
      name: 'ask_gemini',
      arguments: {
        prompt: 'fake direct gemini task',
        mode: 'read-only',
        worktree: 'off',
      },
    }, CallToolResultSchema, {
      onprogress: (progress) => {
        directProgress.push(progress);
      },
    });
    assert.equal(directGemini.isError, false);
    const directGeminiResult = JSON.parse(directGemini.content[0].text);
    assert.equal(directGeminiResult.answer, 'fake gemini progress');
    assert.equal('stdout' in directGeminiResult, false);
    assert.ok(
      directProgress.some((progress) => String(progress.message).includes('Gemini: fake gemini progress')),
      'direct ask progress should render Gemini JSONL events',
    );

    const expectedWorktreeKinds = {
      claude: 'native',
      gemini: 'native',
      codex: 'managed',
      opencode: 'managed',
    };
    const expectedAnswers = {
      claude: 'fake claude progress',
      gemini: 'fake gemini progress',
      codex: 'fake codex progress',
      opencode: 'fake opencode progress',
    };

    for (const agent of ['claude', 'gemini', 'codex', 'opencode']) {
      const result = await collectTask(client, {
        name: `ask_${agent}`,
        arguments: {
          prompt: `fake ${agent} task`,
        },
      });
      assert.equal(result.agent, agent);
      assert.equal(result.status, 'completed');
      assert.equal(result.worktree.kind, expectedWorktreeKinds[agent]);
      assert.equal(result.answer, expectedAnswers[agent]);
      assert.equal('stdout' in result, false);
      assert.ok(existsSync(result.logs.stdout), `${agent} stdout log should exist`);
      assert.ok(existsSync(result.logs.result), `${agent} result log should exist`);
      assert.match(readFileSync(result.logs.stdout, 'utf8'), /SIDEKICK_FAKE_AGENT_OK/);
      assert.match(readFileSync(result.logs.result, 'utf8'), /cleanup_worktree/);

      if (result.worktree.kind === 'managed') {
        assert.ok(result.worktree.path.startsWith(path.join(home, 'worktrees')));
        assert.ok(existsSync(result.worktree.path), `${agent} managed worktree should exist before cleanup`);

        const cleanup = await client.callTool({
          name: 'cleanup_worktree',
          arguments: { taskId: result.taskId },
        }, CallToolResultSchema);
        assert.equal(cleanup.isError, false);
        assert.match(cleanup.content[0].text, /Removed Sidekick worktree/);
        assert.equal(existsSync(result.worktree.path), false, `${agent} managed worktree should be removed`);
      }
    }
  } finally {
    await client.close();
    await transport.close();
  }

  console.log('SIDEKICK_E2E_OK');
} finally {
  cleanupRoot(root);
}
