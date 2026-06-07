import type { SidekickMode } from '../config.js';
import { BaseRunner } from './base.js';
import {
  fallbackAnswer,
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
  preview,
  toolIdFrom,
  toolInfoFrom,
  type CliProgressRenderer,
  type JsonObject,
  type ToolProgressInfo,
} from './progress.js';
import {
  agentTextStep,
  agentToolStep,
  objectValue as trajectoryObjectValue,
  stringValue as trajectoryStringValue,
  stringifyTrajectoryValue,
  type BuildTrajectoryStepsRequest,
  type TrajectoryStep,
} from './trajectory.js';
import type { RunRequest } from './types.js';

function geminiApprovalMode(mode: SidekickMode): string {
  switch (mode) {
    case 'full-access':
      return 'yolo';
    case 'read-only':
      return 'default';
    default:
      return 'auto_edit';
  }
}

export class GeminiRunner extends BaseRunner {
  readonly name = 'gemini';
  readonly fallbackModels = ['auto', 'pro', 'flash', 'flash-lite'];
  readonly fallbackRecommendationModels = ['auto'];
  readonly modelDiscoveryDescription = 'Gemini CLI aliases only (`auto`, `pro`, `flash`, `flash-lite`); Gemini CLI has no headless model-list command';
  readonly worktreeSupport = 'native';

  recommendedAgents(models: string[]): Record<string, unknown> {
    const model = models.find((candidate) => candidate.trim());
    return {
      gemini: {
        runner: 'gemini',
        ...(model ? { model } : {}),
        extraArgs: [],
        description: 'Ask Gemini for broad reasoning and implementation review.',
      },
    };
  }

  extractOutput(stdout: string): ExtractedRunOutput {
    return this.extractEvents(parseJsonLines(stdout)) ?? { answer: fallbackAnswer(stdout) };
  }

  buildTrajectorySteps(request: BuildTrajectoryStepsRequest): TrajectoryStep[] {
    const steps: TrajectoryStep[] = [];
    for (const event of parseJsonLines(request.stdout)) {
      const type = trajectoryStringValue(event.type);
      const timestamp = trajectoryStringValue(event.timestamp) ?? request.fallbackTimestamp;
      if (type === 'message' && event.role === 'assistant') {
        const text = trajectoryStringValue(event.content);
        if (text) {
          steps.push(agentTextStep(request, text, timestamp, { kind: 'runner_message' }));
        }
        continue;
      }

      if (type === 'tool_use') {
        steps.push(agentToolStep(request, {
          timestamp,
          message: trajectoryStringValue(event.name) ?? 'Gemini tool call',
          callId: trajectoryStringValue(event.id) ?? `gemini-tool-${steps.length + 1}`,
          functionName: trajectoryStringValue(event.name) ?? 'tool_use',
          arguments: trajectoryObjectValue(event.args) ?? trajectoryObjectValue(event.arguments) ?? {},
        }));
        continue;
      }

      if (type === 'tool_result') {
        const content = stringifyTrajectoryValue(event.result ?? event.content);
        if (content) {
          steps.push(agentTextStep(request, content, timestamp, {
            kind: 'runner_observation',
            tool_name: event.name,
          }));
        }
      }
    }
    return steps;
  }

  createProgressRenderer(): CliProgressRenderer {
    const toolsById = new Map<string, ToolProgressInfo>();
    return createJsonLineProgressRenderer('gemini', (event) => this.renderProgressEvent(event, toolsById));
  }

  validateEffort(effort?: string): void {
    this.validateNoEffort(effort);
  }

  buildArgs(request: RunRequest): string[] {
    const extraArgs = [...request.agentConfig.extraArgs];
    if (!this.hasArg(extraArgs, '--skip-trust')) {
      extraArgs.push('--skip-trust');
    }
    const args = [
      ...extraArgs,
      '--prompt',
      request.prompt,
      '--output-format',
      'stream-json',
      '--approval-mode',
      geminiApprovalMode(request.mode),
    ];
    if (request.model) {
      args.push('--model', request.model);
    }
    if (request.worktree.kind === 'native' && request.worktree.name) {
      args.push('--worktree', request.worktree.name);
    }
    return args;
  }

  private extractEvents(events: OutputJsonObject[]): ExtractedRunOutput | undefined {
    const accumulator = new TextAccumulator();
    let stats: Record<string, unknown> | undefined;

    for (const event of events) {
      if (event.type === 'message' && event.role === 'assistant') {
        accumulator.append(getOutputString(event.content) ?? '', event.delta === true);
      } else if (event.type === 'result' && isOutputObject(event.stats)) {
        stats = event.stats;
      }
    }

    const answer = accumulator.text();
    return answer ? { answer, ...(stats ? { stats } : {}) } : undefined;
  }

  private rememberToolUse(toolsById: Map<string, ToolProgressInfo>, value: unknown): ToolProgressInfo {
    const info = toolInfoFrom(value);
    if (info.id) {
      toolsById.set(info.id, { ...toolsById.get(info.id), ...info });
    }
    return info;
  }

  private toolInfoForResult(toolsById: Map<string, ToolProgressInfo>, value: unknown): ToolProgressInfo {
    const id = toolIdFrom(value);
    return (id ? toolsById.get(id) : undefined) ?? toolInfoFrom(value);
  }

  private renderProgressEvent(event: JsonObject, toolsById: Map<string, ToolProgressInfo>): string[] {
    const type = getString(event.type);
    if (type === 'init') {
      const model = getString(event.model);
      return [`Gemini started${model ? ` (${model})` : ''}`];
    }
    if (type === 'message') {
      if (event.role === 'user') {
        return [];
      }
      const text = preview(event.content);
      return text ? [`Gemini: ${text}`] : [];
    }
    if (type === 'tool_use') {
      const info = this.rememberToolUse(toolsById, event);
      return [`Gemini using ${formatToolLabel(info)}`];
    }
    if (type === 'tool_result') {
      const info = this.toolInfoForResult(toolsById, event);
      const status = getString(event.status);
      const error = preview(getPath(event, ['error', 'message']) ?? event.error);
      return [`Gemini ${status === 'error' ? 'failed' : 'completed'} ${formatToolLabel(info, 'tool')}${error ? `: ${error}` : ''}`];
    }
    if (type === 'error') {
      const message = preview(event.message ?? event.error);
      return [`Gemini warning${message ? `: ${message}` : ''}`];
    }
    if (type === 'result') {
      const status = getString(event.status);
      const stats = formatTokenStats(event.stats);
      const error = preview(getPath(event, ['error', 'message']) ?? event.error);
      if (status === 'error') {
        return [`Gemini failed${error ? `: ${error}` : ''}`];
      }
      return [`Gemini completed${stats ? ` (${stats})` : ''}`];
    }
    return [];
  }
}

export const geminiRunner = new GeminiRunner();
