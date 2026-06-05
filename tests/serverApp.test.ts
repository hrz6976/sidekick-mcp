import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { CallToolResultSchema, CreateTaskResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('../src/utils/cliDetector.js', () => ({
  detectAvailableClis: vi.fn(),
}));

vi.mock('../src/utils/commandExecutor.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/commandExecutor.js')>();
  return {
    ...actual,
    executeCommand: vi.fn(),
  };
});

import { detectAvailableClis } from '../src/utils/cliDetector.js';
import { executeCommand, CommandExecutionError } from '../src/utils/commandExecutor.js';
import { createServerApp } from '../src/serverApp.js';
import type { SidekickServerApp } from '../src/serverApp.js';
import type { SidekickConfig } from '../src/config.js';
import type { CreateServerAppOptions } from '../src/serverApp.js';

function createConfig(setupRequired = false): SidekickConfig {
  const home = mkdtempSync(path.join(os.tmpdir(), 'sidekick-server-app-'));
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
    setupRequired,
    userConfig: setupRequired
      ? undefined
      : {
          agents: {
            claude: {
              runner: 'claude',
              enabled: true,
              command: 'claude',
              model: 'sonnet',
              extraArgs: [],
            },
            deepseek: {
              runner: 'opencode',
              enabled: true,
              command: 'opencode',
              model: 'deepseek/deepseek-chat',
              reasoningEffort: 'high',
              extraArgs: [],
            },
          },
          defaults: { mode: 'edit', worktree: 'auto' },
        },
  };
}

async function createConnectedPair(
  config = createConfig(),
  options?: CreateServerAppOptions,
) {
  vi.mocked(detectAvailableClis).mockResolvedValue({
    gemini: false,
    codex: true,
    claude: true,
    opencode: false,
  });

  const app = await createServerApp(config, undefined, options);
  const client = new Client(
    { name: 'integration-test-client', version: '1.0.0' },
    {
      capabilities: {
        tasks: {
          list: {},
          cancel: {},
        },
      },
    },
  );

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    app.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return { app, client, config };
}

describe('serverApp', () => {
  let app: SidekickServerApp | undefined;
  let client: Client | undefined;
  let config: SidekickConfig | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await client?.close();
    await app?.close();
    if (config) {
      rmSync(config.sidekickHome, { recursive: true, force: true });
    }
    app = undefined;
    client = undefined;
    config = undefined;
  });

  it('exposes setup and management tools when config is missing', async () => {
    ({ app, client, config } = await createConnectedPair(createConfig(true)));

    const result = await client.listTools();
    expect(result.tools.map((tool) => tool.name)).toEqual([
      'setup',
      'list_agents',
      'cleanup_worktree',
    ]);
    expect(result.tools[0].annotations?.readOnlyHint).toBe(true);
    expect(result.tools[0].description).toContain('Call this tool first');
    expect(result.tools.find((tool) => tool.name === 'list_agents')?.description)
      .toContain('Call setup first');
  });

  it('exposes the configured Sidekick tools with task metadata', async () => {
    ({ app, client, config } = await createConnectedPair());

    const result = await client.listTools();
    expect(result.tools.map((tool) => tool.name)).toEqual([
      'setup',
      'ask_claude',
      'ask_deepseek',
      'list_agents',
      'cleanup_worktree',
    ]);
    expect(result.tools.find((tool) => tool.name === 'ask_claude')?.execution)
      .toEqual({ taskSupport: 'optional' });
    expect(result.tools.find((tool) => tool.name === 'ask_claude')?.description)
      .toContain('read-only');
    expect(result.tools.find((tool) => tool.name === 'ask_claude')?.description)
      .toContain('worktree "auto"');
  });

  it('keeps setup available after configuration and returns reconfiguration guidance', async () => {
    ({ app, client, config } = await createConnectedPair());

    const result = await client.callTool(
      {
        name: 'setup',
        arguments: {},
      },
      CallToolResultSchema,
    );

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('Sidekick is already configured');
    expect(result.content[0].text).toContain('Current Sidekick discovery');
    expect(result.content[0].text).toContain('"configuredAgents"');
    expect(result.content[0].text).toContain('"runnerDiscovery"');
    expect(result.content[0].text).not.toContain('"modelHints"');
    expect(result.content[0].text).toContain('AskUserQuestion');
    expect(result.content[0].text).toContain('do not choose models starting with `opencode/`');
    expect(result.content[0].text).toContain('patch it instead of overwriting');
  });

  it('supports direct ask tool calls without task augmentation', async () => {
    ({ app, client, config } = await createConnectedPair());
    vi.mocked(executeCommand).mockResolvedValue('direct response');

    const result = await client.callTool(
      {
        name: 'ask_claude',
        arguments: { prompt: 'hello', worktree: 'off' },
      },
      CallToolResultSchema,
    );

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.taskId).toBeTruthy();
    expect(parsed.status).toBe('completed');
    expect(parsed.answer).toBe('direct response');
    expect(parsed).not.toHaveProperty('stdout');
    expect(parsed.logs.stdout).toContain(config!.taskRootDir);
    expect(executeCommand).toHaveBeenCalled();
  });

  it('lets ask tool calls override reasoning effort for one run', async () => {
    ({ app, client, config } = await createConnectedPair());
    vi.mocked(executeCommand).mockResolvedValue('effort response');

    const result = await client.callTool(
      {
        name: 'ask_claude',
        arguments: { prompt: 'hello', effort: 'xhigh', worktree: 'off' },
      },
      CallToolResultSchema,
    );

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.effort).toBe('xhigh');
    expect(parsed.answer).toBe('effort response');
    expect(executeCommand).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['--effort', 'xhigh']),
      expect.any(Object),
    );
  });

  it('keeps progress values monotonic for long direct ask calls', async () => {
    const progressConfig = createConfig();
    progressConfig.progressThrottleMs = 0;
    ({ app, client, config } = await createConnectedPair(progressConfig));
    vi.mocked(executeCommand).mockImplementation(async (_command, _args, options) => {
      for (let index = 0; index < 105; index += 1) {
        options?.onProgress?.(`chunk ${index}\n`);
      }
      return 'direct response';
    });

    const progressEvents: Array<{ progress: number; total?: number; message?: string }> = [];
    const result = await client.callTool(
      {
        name: 'ask_claude',
        arguments: { prompt: 'hello', worktree: 'off' },
      },
      CallToolResultSchema,
      {
        onprogress: (progress) => {
          progressEvents.push(progress as { progress: number; total?: number; message?: string });
        },
      },
    );

    expect(result.isError).toBe(false);
    expect(progressEvents.length).toBeGreaterThan(2);
    for (let index = 1; index < progressEvents.length; index += 1) {
      expect(progressEvents[index].progress).toBeGreaterThan(progressEvents[index - 1].progress);
    }
    expect(progressEvents.at(-1)?.message).toBe('Completed ask_claude');
    expect(progressEvents.at(-1)).not.toHaveProperty('total');
  });

  it('translates CLI JSON stdout into readable progress messages', async () => {
    ({ app, client, config } = await createConnectedPair());
    vi.mocked(executeCommand).mockImplementation(async (_command, _args, options) => {
      options?.onProgress?.(`${JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Inspecting the repository.' },
            { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } },
          ],
        },
      })}
`);
      return 'done';
    });
    const onprogress = vi.fn();

    const result = await client.callTool(
      {
        name: 'ask_claude',
        arguments: { prompt: 'hello', worktree: 'off' },
      },
      CallToolResultSchema,
      { onprogress },
    );

    expect(result.isError).toBe(false);
    const messages = onprogress.mock.calls.map(([progress]) => String(progress.message ?? ''));
    expect(messages).toContain('Claude using Bash');
    expect(messages.some((message) => message.includes('"type":"assistant"'))).toBe(false);
  });

  it('lists configured agents and model hints', async () => {
    ({ app, client, config } = await createConnectedPair());

    const result = await client.callTool(
      {
        name: 'list_agents',
        arguments: {},
      },
      CallToolResultSchema,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.agents.find((agent: { agent: string }) => agent.agent === 'claude').model).toBe('sonnet');
    expect(parsed.agents.find((agent: { agent: string }) => agent.agent === 'deepseek').runner).toBe('opencode');
    expect(parsed.agents.find((agent: { agent: string }) => agent.agent === 'deepseek').reasoningEffort).toBe('high');
    expect(parsed.agents.find((agent: { agent: string; models: string[] }) => agent.agent === 'claude').models).toContain('sonnet');
    expect(result.content[0].text).not.toContain('modelHints');
    expect(parsed.guidance.join('\n')).toContain('`opencode models` without `--refresh`');
  });

  it('supports task-based Sidekick execution and returns metadata/log paths', async () => {
    ({ app, client, config } = await createConnectedPair());
    vi.mocked(executeCommand).mockImplementation(async (_command, _args, options) => {
      options?.onProgress?.('thinking...');
      return 'mock response';
    });
    await client.listTools();

    const messages: Array<{ type: string; [key: string]: unknown }> = [];
    for await (const message of client.experimental.tasks.callToolStream(
      {
        name: 'ask_claude',
        arguments: {
          prompt: 'TRACE_THIS_FULL_PROMPT_BODY',
          worktree: 'off',
        },
      },
      CallToolResultSchema,
    )) {
      messages.push(message as { type: string; [key: string]: unknown });
    }

    expect(messages.some((message) => message.type === 'taskCreated')).toBe(true);
    const resultMessage = messages.find((message) => message.type === 'result') as {
      result: { content: Array<{ text: string }> };
    };
    const result = JSON.parse(resultMessage.result.content[0].text);

    expect(result.status).toBe('completed');
    expect(result.agent).toBe('claude');
    expect(result.runner).toBe('claude');
    expect(result.model).toBe('sonnet');
    expect(result.logs.stdout).toContain(config!.taskRootDir);
    expect(result.cleanupHint).toContain('cleanup_worktree');
    expect(result.answer).toBe('mock response');
    expect(result).not.toHaveProperty('stdout');

    const logContents = readFileSync(config!.logPath, 'utf8');
    expect(logContents).toContain('TRACE_THIS_FULL_PROMPT_BODY');
  });

  it('accepts task augmentation from _meta.task for compatibility with task-capable clients', async () => {
    ({ app, client, config } = await createConnectedPair());
    vi.mocked(executeCommand).mockImplementation(async (_command, _args, options) => {
      options?.onProgress?.('thinking...');
      return 'mock response';
    });
    await client.listTools();

    const created = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'ask_claude',
          arguments: {
            prompt: 'TRACE_META_TASK',
            worktree: 'off',
          },
          _meta: {
            task: {
              ttl: 60_000,
              pollInterval: 5,
            },
          },
        },
      },
      CreateTaskResultSchema,
    );

    expect(created.task.taskId).toBeTruthy();

    await vi.waitFor(async () => {
      const task = await client!.experimental.tasks.getTask(created.task.taskId);
      expect(task.status).toBe('completed');
    });

    const result = await client.experimental.tasks.getTaskResult(
      created.task.taskId,
      CallToolResultSchema,
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('completed');
    expect(parsed.answer).toBe('mock response');
    expect(parsed).not.toHaveProperty('stdout');
    expect(readFileSync(config!.logPath, 'utf8')).toContain('TRACE_META_TASK');
    expect(executeCommand).toHaveBeenCalled();
  });

  it('defaults read-only ask calls to no worktree', async () => {
    ({ app, client, config } = await createConnectedPair());
    vi.mocked(executeCommand).mockResolvedValue('read only response');
    await client.listTools();

    const messages: Array<{ type: string; [key: string]: unknown }> = [];
    for await (const message of client.experimental.tasks.callToolStream(
      {
        name: 'ask_claude',
        arguments: {
          prompt: 'inspect only',
          mode: 'read-only',
        },
      },
      CallToolResultSchema,
    )) {
      messages.push(message as { type: string; [key: string]: unknown });
    }

    const resultMessage = messages.find((message) => message.type === 'result') as {
      result: { content: Array<{ text: string }> };
    };
    const result = JSON.parse(resultMessage.result.content[0].text);

    expect(result.mode).toBe('read-only');
    expect(result.worktree.kind).toBe('none');
  });

  it('cancels task-backed Sidekick execution and aborts the subprocess', async () => {
    ({ app, client, config } = await createConnectedPair());

    let aborted = false;
    vi.mocked(executeCommand).mockImplementation((_command, _args, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new CommandExecutionError('cancelled', 'Command cancelled', {
            command: 'claude',
            args: [],
          }));
        }, { once: true });
      }),
    );
    await client.listTools();

    const stream = client.experimental.tasks.callToolStream(
      {
        name: 'ask_claude',
        arguments: {
          prompt: 'hello',
          worktree: 'off',
        },
      },
      CallToolResultSchema,
    );

    const iterator = stream[Symbol.asyncIterator]();
    const firstMessage = await iterator.next();

    expect(firstMessage.value?.type).toBe('taskCreated');
    const taskId = firstMessage.value?.task.taskId as string;

    await vi.waitFor(() => {
      expect(executeCommand).toHaveBeenCalled();
    });
    await client.experimental.tasks.cancelTask(taskId);
    const task = await client.experimental.tasks.getTask(taskId);

    expect(task.status).toBe('cancelled');
    expect(aborted).toBe(true);

    await iterator.return?.();
  });

  it('resolves session working directory before task execution', async () => {
    ({ app, client, config } = await createConnectedPair(createConfig(), {
      sessionContext: {
        transport: 'http',
        resolveWorkingDirectory: vi.fn().mockResolvedValue({
          cwd: '/tmp/http-project',
          projectRoots: [{ uri: 'file:///tmp/http-project' }],
        }),
      },
    }));
    vi.mocked(executeCommand).mockResolvedValue('resolved response');
    await client.listTools();

    for await (const _message of client.experimental.tasks.callToolStream(
      {
        name: 'ask_claude',
        arguments: {
          prompt: 'hello',
          worktree: 'off',
        },
      },
      CallToolResultSchema,
    )) {
      // Drain stream.
    }

    expect(executeCommand).toHaveBeenCalledWith(
      'claude',
      expect.any(Array),
      expect.objectContaining({
        cwd: '/tmp/http-project',
      }),
    );
  });
});
