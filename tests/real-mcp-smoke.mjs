import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema, ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const agent = process.argv[2] ?? 'claude';
const model = process.argv[3] ?? (agent === 'claude' ? 'sonnet' : '');
const command = process.argv[4] ?? agent;
const marker = 'SIDEKICK_REAL_SMOKE_OK';

function agentConfig(name) {
  return {
    enabled: name === agent,
    command: name === agent ? command : name,
    extraArgs: [],
  };
}

const root = mkdtempSync(path.join(tmpdir(), 'sidekick-real-smoke-'));
let failed = false;
function dumpDiagnostics(home) {
  console.error(`SIDEKICK_REAL_SMOKE_HOME=${home}`);
  const logPath = path.join(home, 'logs', 'sidekick.log');
  if (existsSync(logPath)) {
    console.error(`--- ${logPath} ---`);
    console.error(readFileSync(logPath, 'utf8'));
  }
  const tasksDir = path.join(home, 'tasks');
  if (existsSync(tasksDir)) {
    for (const taskId of readdirSync(tasksDir)) {
      const taskDir = path.join(tasksDir, taskId);
      for (const fileName of ['metadata.json', 'stdout.log', 'stderr.log', 'result.json']) {
        const filePath = path.join(taskDir, fileName);
        if (existsSync(filePath)) {
          console.error(`--- ${filePath} ---`);
          console.error(readFileSync(filePath, 'utf8'));
        }
      }
    }
  }
}
try {
  const home = path.join(root, 'home');
  mkdirSync(home, { recursive: true });
  writeFileSync(path.join(home, 'config.json'), JSON.stringify({
    agents: {
      [agent]: {
        ...agentConfig(agent),
        runner: agent,
        ...(model ? { model } : {}),
      },
    },
    defaults: { mode: 'read-only', worktree: 'off' },
  }, null, 2), 'utf8');

  const client = new Client(
    { name: 'sidekick-real-smoke-client', version: '1.0.0' },
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
    roots: [{ uri: `file://${repoRoot}` }],
  }));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, 'dist', 'index.js')],
    cwd: repoRoot,
    env: {
      ...process.env,
      SIDEKICK_HOME: home,
      SIDEKICK_STDERR_LOG_LEVEL: 'silent',
    },
    stderr: 'pipe',
  });
  const stderrChunks = [];
  transport.stderr?.on('data', (chunk) => stderrChunks.push(String(chunk)));
  await client.connect(transport);

  try {
    await client.listTools();
    const messages = [];
    const taskArguments = {
      prompt: `Reply with exactly ${marker} and no other text.`,
      mode: 'read-only',
      worktree: 'off',
    };

    for await (const message of client.experimental.tasks.callToolStream({
      name: `ask_${agent}`,
      arguments: taskArguments,
    }, CallToolResultSchema)) {
      messages.push(message);
    }

    const resultMessage = messages.find((message) => message.type === 'result');
    if (!resultMessage) {
      console.error(JSON.stringify(messages, null, 2));
    }
    assert.ok(resultMessage, 'task stream should include result');
    assert.equal(resultMessage.result.isError, false);
    const result = JSON.parse(resultMessage.result.content[0].text);
    assert.equal(result.status, 'completed');
    assert.equal(result.agent, agent);
    assert.equal(result.runner, agent);
    assert.match(result.answer, new RegExp(marker));
    assert.equal('stdout' in result, false);
    console.log(`SIDEKICK_REAL_MODEL_SMOKE_OK agent=${agent} model=${model}`);
  } catch (error) {
    failed = true;
    const stderr = stderrChunks.join('').trim();
    if (stderr) {
      console.error(stderr);
    }
    dumpDiagnostics(home);
    throw error;
  } finally {
    await client.close();
    await transport.close();
  }
} finally {
  if (!failed && !process.env.SIDEKICK_KEEP_REAL_SMOKE) {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } else {
    console.error(`Preserved real smoke temp dir: ${root}`);
  }
}
