import type { AgentConfig, SidekickMode } from '../config.js';
import type { ToolExecutionContext } from '../execution.js';
import { executeCommand } from '../utils/commandExecutor.js';
import { BaseRunner } from './base.js';
import {
  fallbackAnswer,
  getPath as getOutputPath,
  getString as getOutputString,
  isObject as isOutputObject,
  parseJsonLines,
  TextAccumulator,
  type ExtractedRunOutput,
  type JsonObject as OutputJsonObject,
} from './output.js';
import {
  createJsonLineProgressRenderer,
  formatToolLabel,
  formatTokenStats,
  getPath,
  getString,
  isObject,
  lastMeaningfulLine,
  preview,
  toolInfoFrom,
  type CliProgressRenderer,
  type JsonObject,
} from './progress.js';
import {
  agentTextStep,
  agentToolStep,
  compactRecord,
  objectValue,
  stringValue,
  type BuildTrajectoryStepsRequest,
  type TrajectoryStep,
} from './trajectory.js';
import type { RunRequest } from './types.js';

const CODEX_EFFORTS = ['minimal', 'low', 'medium', 'high'] as const;

function codexSandbox(mode: SidekickMode): string {
  switch (mode) {
    case 'read-only':
      return 'read-only';
    case 'full-access':
      return 'danger-full-access';
    default:
      return 'workspace-write';
  }
}

export class CodexRunner extends BaseRunner {
  readonly name = 'codex';
  readonly fallbackModels = ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex'];
  readonly modelDiscoveryDescription = '`codex debug models --bundled` local bundled catalog parsing; falls back to Sidekick built-in Codex hints';

  recommendedAgents(models: string[]): Record<string, unknown> {
    const model = models.find((candidate) => candidate.trim());
    return {
      codex: {
        runner: 'codex',
        ...(model ? { model } : {}),
        extraArgs: [],
        description: 'Ask Codex for coding tasks and repository changes.',
      },
    };
  }

  extractOutput(stdout: string): ExtractedRunOutput {
    return this.extractEvents(parseJsonLines(stdout)) ?? { answer: fallbackAnswer(stdout) };
  }

  buildTrajectorySteps(request: BuildTrajectoryStepsRequest): TrajectoryStep[] {
    const steps: TrajectoryStep[] = [];
    for (const event of parseJsonLines(request.stdout)) {
      const item = objectValue(event.item);
      if (!item) {
        continue;
      }

      const timestamp = stringValue(event.timestamp) ?? request.fallbackTimestamp;
      if (item.type === 'agent_message') {
        const text = stringValue(item.text);
        if (text) {
          steps.push(agentTextStep(request, text, timestamp, { kind: 'runner_message', event_type: event.type }));
        }
        continue;
      }

      if (item.type === 'command_execution') {
        const command = stringValue(item.command) ?? '';
        const callId = stringValue(item.id) ?? `codex-command-${steps.length + 1}`;
        steps.push(agentToolStep(request, {
          timestamp,
          message: command ? `Run command: ${command}` : 'Run command',
          callId,
          functionName: 'command_execution',
          arguments: command ? { command } : {},
          output: stringValue(item.aggregated_output),
          extra: compactRecord({
            kind: 'runner_tool',
            status: item.status,
            exit_code: item.exit_code,
          }),
        }));
        continue;
      }

      if (item.type === 'mcp_tool_call') {
        const callId = stringValue(item.id) ?? `codex-mcp-${steps.length + 1}`;
        const server = stringValue(item.server);
        const tool = stringValue(item.tool);
        steps.push(agentToolStep(request, {
          timestamp,
          message: [server, tool].filter(Boolean).join('.') || 'MCP tool call',
          callId,
          functionName: [server, tool].filter(Boolean).join('.') || 'mcp_tool_call',
          arguments: objectValue(item.arguments) ?? {},
          output: stringValue(item.output),
          extra: compactRecord({ kind: 'runner_tool', status: item.status }),
        }));
      }
    }
    return steps;
  }

  createProgressRenderer(): CliProgressRenderer {
    return createJsonLineProgressRenderer('codex', (event) => this.renderProgressEvent(event));
  }

  validateEffort(effort?: string): void {
    this.validateEnumEffort(effort, CODEX_EFFORTS);
  }

  buildArgs(request: RunRequest): string[] {
    const args = this.appendReasoningEffort([
      'exec',
      ...request.agentConfig.extraArgs,
      '--json',
      '--cd',
      request.cwd,
      '--sandbox',
      codexSandbox(request.mode),
      '--skip-git-repo-check',
    ], request.agentConfig.effort);
    if (request.model) {
      args.push('--model', request.model);
    }
    return this.appendPrompt(args, request.prompt);
  }

  protected async discoverModels(
    config: AgentConfig,
    context?: ToolExecutionContext,
  ): Promise<string[]> {
    if (!config.enabled) {
      return this.fallbackModels;
    }
    try {
      const output = await executeCommand(config.command, ['debug', 'models', '--bundled'], {
        ...context,
        timeoutMs: 30_000,
      });
      const models = this.parseModels(output);
      return models.length ? models : this.fallbackModels;
    } catch {
      return this.fallbackModels;
    }
  }

  private appendReasoningEffort(args: string[], effort?: string): string[] {
    if (!effort || this.hasConfigOverride(args, 'model_reasoning_effort')) {
      return args;
    }
    return [...args, '--config', `model_reasoning_effort=${JSON.stringify(effort)}`];
  }

  private parseModels(output: string): string[] {
    const parsed = JSON.parse(output) as unknown;
    const records = typeof parsed === 'object' && parsed !== null && Array.isArray(
      (parsed as { models?: unknown }).models,
    )
      ? (parsed as { models: unknown[] }).models
      : Array.isArray(parsed)
        ? parsed
        : [];

    return this.uniqueModels(records.flatMap((record) => {
      if (!record || typeof record !== 'object') {
        return [];
      }
      const model = record as { slug?: unknown; id?: unknown; name?: unknown; visibility?: unknown };
      const id = typeof model.slug === 'string'
        ? model.slug
        : typeof model.id === 'string'
          ? model.id
          : typeof model.name === 'string'
            ? model.name
            : '';
      if (!id || model.visibility === 'hide') {
        return [];
      }
      return [id];
    }));
  }

  private extractEvents(events: OutputJsonObject[]): ExtractedRunOutput | undefined {
    const accumulator = new TextAccumulator();
    let stats: Record<string, unknown> | undefined;

    for (const event of events) {
      const type = getOutputString(event.type);
      if (type === 'turn.completed' && isOutputObject(event.usage)) {
        stats = event.usage;
      }

      if ((type === 'item.completed' || type === 'item.updated') && isOutputObject(event.item)) {
        if (event.item.type === 'agent_message') {
          accumulator.append(getOutputString(event.item.text) ?? '');
        }
      }

      if (isOutputObject(event.msg) && event.msg.type === 'text') {
        accumulator.append(getOutputString(event.msg.content) ?? '');
      }

      if (getOutputString(event.method) === 'item/agentMessage/delta') {
        accumulator.append(getOutputString(getOutputPath(event, ['params', 'delta'])) ?? '', true);
      }
    }

    const answer = accumulator.text();
    return answer ? { answer, ...(stats ? { stats } : {}) } : undefined;
  }

  private renderProgressEvent(event: JsonObject): string[] {
    const type = getString(event.type);
    if (type === 'thread.started') {
      return ['Codex thread started'];
    }
    if (type === 'turn.started') {
      return ['Codex turn started'];
    }
    if (type === 'turn.completed') {
      const usage = formatTokenStats(event.usage);
      return [`Codex completed${usage ? ` (${usage})` : ''}`];
    }
    if (type === 'turn.failed' || type === 'error') {
      const message = preview(getPath(event, ['error', 'message']) ?? event.message);
      return [`Codex failed${message ? `: ${message}` : ''}`];
    }
    if ((type === 'item.started' || type === 'item.updated' || type === 'item.completed') && isObject(event.item)) {
      return this.itemLabel(event.item, type);
    }

    const msg = event.msg;
    if (isObject(msg)) {
      const msgType = getString(msg.type);
      if (msgType === 'text') {
        const text = preview(msg.content);
        return text ? [`Codex: ${text}`] : [];
      }
      if (msgType === 'exec_approval_request') {
        const command = preview(msg.command ?? msg.content, 120);
        return [`Codex requested command approval${command ? `: ${command}` : ''}`];
      }
      if (msgType === 'apply_patch_approval_request') {
        return ['Codex requested patch approval'];
      }
      if (msgType === 'turn_complete') {
        return ['Codex completed'];
      }
      if (msgType === 'error') {
        const message = preview(msg.message ?? msg.content);
        return [`Codex error${message ? `: ${message}` : ''}`];
      }
    }

    const method = getString(event.method);
    if (method === 'item/agentMessage/delta') {
      const text = preview(getPath(event, ['params', 'delta']));
      return text ? [`Codex: ${text}`] : [];
    }
    if (method?.includes('turn') && method.endsWith('/started')) {
      return ['Codex turn started'];
    }
    if (method?.includes('turn') && method.endsWith('/completed')) {
      return ['Codex completed'];
    }
    return [];
  }

  private itemLabel(item: JsonObject, eventType: string): string[] {
    const itemType = getString(item.type);
    if (itemType === 'agent_message') {
      const text = preview(item.text);
      return text ? [`Codex: ${text}`] : [];
    }
    if (itemType === 'reasoning') {
      return ['Codex is reasoning...'];
    }
    if (itemType === 'command_execution') {
      const command = preview(item.command, 120);
      const status = getString(item.status);
      const lastOutput = lastMeaningfulLine(item.aggregated_output);
      if (eventType === 'item.updated' && lastOutput) {
        return [`Codex command output: ${lastOutput}`];
      }
      if (eventType === 'item.completed') {
        const exitCode = item.exit_code;
        return [`Codex command ${status === 'failed' ? 'failed' : 'completed'}${typeof exitCode === 'number' ? ` (${exitCode})` : ''}${command ? `: ${command}` : ''}`];
      }
      return [`Codex running command${command ? `: ${command}` : ''}`];
    }
    if (itemType === 'file_change') {
      const changes = Array.isArray(item.changes) ? item.changes : [];
      const paths = changes
        .map((change) => preview(getPath(change, ['path']), 40))
        .filter((path): path is string => Boolean(path));
      return [`Codex changed ${changes.length} file${changes.length === 1 ? '' : 's'}${paths.length ? `: ${paths.slice(0, 3).join(', ')}` : ''}`];
    }
    if (itemType === 'mcp_tool_call') {
      const server = getString(item.server);
      const tool = getString(item.tool);
      const status = getString(item.status);
      const name = [server, tool].filter(Boolean).join('.');
      const info = { ...toolInfoFrom(item), name: name || tool };
      return [`Codex ${eventType === 'item.completed' ? status === 'failed' ? 'failed MCP tool' : 'completed MCP tool' : 'calling MCP tool'} ${formatToolLabel(info, 'MCP tool')}`];
    }
    if (itemType === 'web_search') {
      const query = preview(item.query, 120);
      return [`Codex web search${query ? `: ${query}` : ''}`];
    }
    if (itemType === 'todo_list') {
      const items = Array.isArray(item.items) ? item.items : [];
      const completed = items.filter((todo) => getPath(todo, ['completed']) === true).length;
      const next = items.find((todo) => isObject(todo) && todo.completed !== true);
      const nextText = preview(getPath(next, ['text']), 80);
      return [`Codex updated todo list (${completed}/${items.length} complete)${nextText ? `; next: ${nextText}` : ''}`];
    }
    if (itemType === 'error') {
      const message = preview(item.message);
      return [`Codex error${message ? `: ${message}` : ''}`];
    }
    return [];
  }
}

export const codexRunner = new CodexRunner();
