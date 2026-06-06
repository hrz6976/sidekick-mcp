import type { AgentConfig } from '../config.js';
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
  formatTokenStats,
  getPath,
  getString,
  isObject,
  lastMeaningfulLine,
  preview,
  toolNameFrom,
  type CliProgressRenderer,
  type JsonObject,
} from './progress.js';
import type { RunRequest } from './types.js';

export class OpenCodeRunner extends BaseRunner {
  readonly name = 'opencode';
  readonly fallbackModels: string[] = [];
  readonly fallbackRecommendationModels = ['deepseek/deepseek-chat'];
  readonly modelDiscoveryDescription = '`opencode models` local provider-layer parsing; Sidekick never uses `--refresh` by default';

  recommendedAgents(models: string[]): Record<string, unknown> {
    const agents: Record<string, unknown> = {};
    const selected = new Set<string>();
    const deepseek = this.preferModel(models, /deepseek/i);
    if (deepseek) {
      selected.add(deepseek);
      agents.deepseek = {
        runner: 'opencode',
        model: deepseek,
        reasoningEffort: 'high',
        extraArgs: [],
        description: 'Ask DeepSeek through OpenCode with high reasoning effort.',
      };
    }

    const kimi = this.preferModel(models, /kimi|moonshot/i, selected);
    if (kimi) {
      selected.add(kimi);
      agents.kimi = {
        runner: 'opencode',
        model: kimi,
        extraArgs: [],
        description: 'Ask Kimi through OpenCode.',
      };
    }

    if (!deepseek && !kimi) {
      const preferred = this.preferModel(models);
      agents.opencode = {
        runner: 'opencode',
        ...(preferred ? { model: preferred } : {}),
        extraArgs: [],
        description: 'Ask a configured OpenCode provider/model.',
      };
    }

    return agents;
  }

  extractOutput(stdout: string): ExtractedRunOutput {
    return this.extractEvents(parseJsonLines(stdout)) ?? { answer: fallbackAnswer(stdout) };
  }

  createProgressRenderer(): CliProgressRenderer {
    return createJsonLineProgressRenderer('opencode', (event) => this.renderProgressEvent(event));
  }

  validateEffort(effort?: string): void {
    if (!effort) {
      return;
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(effort)) {
      throw new Error(
        'Runner "opencode" effort maps to --variant and must be a simple variant name.',
      );
    }
  }

  buildArgs(request: RunRequest): string[] {
    const args = this.appendReasoningEffort([
      'run',
      ...request.agentConfig.extraArgs,
      '--dir',
      request.cwd,
      '--format',
      'json',
      '--thinking',
    ], request.agentConfig.reasoningEffort);
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
      const output = await executeCommand(config.command, ['models'], {
        ...context,
        timeoutMs: 30_000,
      });
      return output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.split(/\s+/)[0])
        .filter((model) => model.includes('/'))
        .filter((model, index, models) => models.indexOf(model) === index);
    } catch {
      return this.fallbackModels;
    }
  }

  private appendReasoningEffort(args: string[], effort?: string): string[] {
    if (!effort || this.hasArg(args, '--variant')) {
      return args;
    }
    return [...args, '--variant', effort];
  }

  private preferModel(
    models: string[],
    pattern?: RegExp,
    excludedModels = new Set<string>(),
  ): string | undefined {
    return models.find((model) => {
      if (excludedModels.has(model)) {
        return false;
      }
      return pattern ? pattern.test(model) : !model.startsWith('opencode/');
    });
  }

  private extractEvents(events: OutputJsonObject[]): ExtractedRunOutput | undefined {
    const accumulator = new TextAccumulator();
    let stats: Record<string, unknown> | undefined;

    for (const event of events) {
      if (event.type === 'text') {
        accumulator.append(getOutputString(getOutputPath(event, ['part', 'text']) ?? event.text) ?? '', event.delta === true);
      } else if (event.type === 'step_finish' && isOutputObject(getOutputPath(event, ['part', 'tokens']))) {
        stats = getOutputPath(event, ['part', 'tokens']) as Record<string, unknown>;
      }
    }

    const answer = accumulator.text();
    return answer ? { answer, ...(stats ? { stats } : {}) } : undefined;
  }

  private renderProgressEvent(event: JsonObject): string[] {
    const type = getString(event.type);
    const part = isObject(event.part) ? event.part : undefined;
    if (type === 'step_start') {
      return ['OpenCode step started'];
    }
    if (type === 'step_finish') {
      const reason = getString(part?.reason);
      const tokens = formatTokenStats(part?.tokens);
      if (reason === 'stop') {
        return [`OpenCode step completed${tokens ? ` (${tokens})` : ''}`];
      }
      if (reason === 'tool-calls') {
        return ['OpenCode step finished; tool calls completed'];
      }
      return ['OpenCode step finished'];
    }
    if (type === 'text') {
      const text = preview(part?.text ?? event.text);
      return text ? [`OpenCode: ${text}`] : [];
    }
    if (type === 'reasoning') {
      return ['OpenCode is reasoning...'];
    }
    if (type === 'tool_use') {
      const tool = getString(part?.tool) ?? toolNameFrom(part) ?? toolNameFrom(event);
      const status = getString(getPath(part, ['state', 'status']));
      const title = preview(getPath(part, ['state', 'title']), 80);
      const exitCode = getPath(part, ['state', 'metadata', 'exit']);
      const lastOutput = lastMeaningfulLine(getPath(part, ['state', 'output']) ?? getPath(part, ['state', 'metadata', 'output']));
      if (status === 'error') {
        const error = preview(getPath(part, ['state', 'error']));
        return [`OpenCode tool failed${tool ? `: ${tool}` : ''}${error ? `: ${error}` : ''}`];
      }
      return [`OpenCode tool completed${tool ? `: ${tool}` : ''}${title ? ` (${title})` : ''}${typeof exitCode === 'number' ? ` exit ${exitCode}` : ''}${lastOutput ? `: ${lastOutput}` : ''}`];
    }
    if (type === 'error') {
      const message = preview(
        getPath(event, ['error', 'data', 'message'])
          ?? getPath(event, ['error', 'message'])
          ?? getPath(event, ['error', 'name'])
          ?? event.error,
      );
      return [`OpenCode error${message ? `: ${message}` : ''}`];
    }
    return [];
  }
}

export const openCodeRunner = new OpenCodeRunner();
