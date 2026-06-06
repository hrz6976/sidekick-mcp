import type { SidekickMode } from '../config.js';
import { BaseRunner } from './base.js';
import {
  fallbackAnswer,
  getPath as getOutputPath,
  getString as getOutputString,
  isObject as isOutputObject,
  normalizeAnswer,
  parseJsonLines,
  TextAccumulator,
  type ExtractedRunOutput,
  type JsonObject as OutputJsonObject,
} from './output.js';
import {
  createJsonLineProgressRenderer,
  getPath,
  getString,
  isObject,
  preview,
  toolNameFrom,
  type CliProgressRenderer,
  type JsonObject,
} from './progress.js';
import type { RunRequest } from './types.js';

const CLAUDE_EFFORTS = ['low', 'medium', 'high'] as const;

function claudePermissionMode(mode: SidekickMode): string {
  switch (mode) {
    case 'read-only':
      return 'plan';
    case 'full-access':
      return 'bypassPermissions';
    default:
      return 'acceptEdits';
  }
}

export class ClaudeRunner extends BaseRunner {
  readonly name = 'claude';
  readonly fallbackModels = ['sonnet', 'opus', 'haiku'];
  readonly modelDiscoveryDescription = 'Claude Code aliases only (`sonnet`, `opus`, `haiku`) plus any full model name the user chooses; Claude CLI has no headless model-list command';
  readonly worktreeSupport = 'native';

  recommendedAgents(models: string[]): Record<string, unknown> {
    const model = models.find((candidate) => candidate.trim());
    return {
      claude: {
        runner: 'claude',
        ...(model ? { model } : {}),
        extraArgs: [],
        description: 'Ask Claude for implementation and code review.',
      },
    };
  }

  extractOutput(stdout: string): ExtractedRunOutput {
    return this.extractEvents(parseJsonLines(stdout)) ?? { answer: fallbackAnswer(stdout) };
  }

  createProgressRenderer(): CliProgressRenderer {
    return createJsonLineProgressRenderer('claude', (event) => this.renderProgressEvent(event));
  }

  validateEffort(effort?: string): void {
    this.validateEnumEffort(effort, CLAUDE_EFFORTS);
  }

  buildArgs(request: RunRequest): string[] {
    const args = this.appendReasoningEffort([
      ...request.agentConfig.extraArgs,
      '--print',
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      claudePermissionMode(request.mode),
    ], request.agentConfig.reasoningEffort);
    if (request.model) {
      args.push('--model', request.model);
    }
    if (request.worktree.kind === 'native' && request.worktree.name) {
      args.push('--worktree', request.worktree.name);
    }
    return this.appendPrompt(args, request.prompt);
  }

  private appendReasoningEffort(args: string[], effort?: string): string[] {
    if (!effort || this.hasArg(args, '--effort')) {
      return args;
    }
    return [...args, '--effort', effort];
  }

  private extractEvents(events: OutputJsonObject[]): ExtractedRunOutput | undefined {
    const accumulator = new TextAccumulator();
    let resultText: string | undefined;

    for (const event of events) {
      const type = getOutputString(event.type);
      if (type === 'assistant') {
        this.appendContent(
          accumulator,
          event.content ?? getOutputPath(event, ['message', 'content']),
        );
      } else if (type === 'streamlined_text') {
        accumulator.append(getOutputString(event.text) ?? '', event.delta === true);
      } else if (type === 'stream_event') {
        const deltaType = getOutputString(getOutputPath(event, ['event', 'delta', 'type']));
        if (deltaType === 'text_delta') {
          accumulator.append(getOutputString(getOutputPath(event, ['event', 'delta', 'text'])) ?? '', true);
        }
      } else if (type === 'result') {
        resultText = getOutputString(event.result) ?? resultText;
      }
    }

    const answer = normalizeAnswer(resultText ?? accumulator.text());
    return answer ? { answer } : undefined;
  }

  private appendContent(accumulator: TextAccumulator, content: unknown) {
    if (Array.isArray(content)) {
      for (const part of content) {
        if (!isOutputObject(part)) {
          continue;
        }
        if (part.type === 'text') {
          accumulator.append(getOutputString(part.text) ?? '');
        }
      }
      return;
    }

    accumulator.append(getOutputString(content) ?? '');
  }

  private renderProgressEvent(event: JsonObject): string[] {
    const type = getString(event.type);
    if (type === 'system') {
      return this.renderSystemEvent(event);
    }

    if (type === 'streamlined_text') {
      const text = preview(event.text);
      return text ? [`Claude: ${text}`] : [];
    }

    if (type === 'streamlined_tool_use_summary') {
      const summary = preview(event.tool_summary);
      return summary ? [`Claude tools: ${summary}`] : [];
    }

    if (type === 'tool_progress') {
      const name = getString(event.tool_name);
      const elapsed = event.elapsed_time_seconds;
      const elapsedText = typeof elapsed === 'number' ? ` for ${Math.round(elapsed)}s` : '';
      return [`Claude ${name ?? 'tool'} still running${elapsedText}`];
    }

    if (type === 'assistant') {
      return this.renderAssistantEvent(event);
    }

    if (type === 'user') {
      const content = getPath(event, ['message', 'content']);
      if (Array.isArray(content)) {
        return content.flatMap((part) => {
          if (!isObject(part) || part.type !== 'tool_result') {
            return [];
          }
          const failed = part.is_error === true || getPath(event, ['tool_use_result', 'is_error']) === true;
          const stderr = preview(getPath(event, ['tool_use_result', 'stderr']));
          return [`Claude tool ${failed ? 'failed' : 'completed'}${stderr ? `: ${stderr}` : ''}`];
        });
      }
    }

    if (type === 'tool_use') {
      return [`Claude using ${toolNameFrom(event) ?? 'a tool'}`];
    }

    if (type === 'tool_result') {
      const name = toolNameFrom(event);
      return [`Claude received${name ? ` ${name}` : ' tool'} result`];
    }

    if (type === 'stream_event') {
      const deltaType = getString(getPath(event, ['event', 'delta', 'type']));
      if (deltaType === 'text_delta') {
        const text = preview(getPath(event, ['event', 'delta', 'text']));
        return text ? [`Claude: ${text}`] : [];
      }
      const blockType = getString(getPath(event, ['event', 'content_block', 'type']));
      if (blockType === 'tool_use') {
        return [`Claude using ${toolNameFrom(getPath(event, ['event', 'content_block'])) ?? 'a tool'}`];
      }
    }

    if (type === 'result') {
      const failed = event.is_error === true || event.subtype === 'error';
      const text = preview(event.result);
      return [`Claude ${failed ? 'failed' : 'completed'}${text ? `: ${text}` : ''}`];
    }

    return [];
  }

  private renderSystemEvent(event: JsonObject): string[] {
    const subtype = getString(event.subtype);
    if (subtype === 'init') {
      const model = getString(event.model);
      return [`Claude started${model ? ` (${model})` : ''}`];
    }
    if (subtype === 'api_retry') {
      const attempt = event.attempt;
      const maxRetries = event.max_retries;
      const delay = event.retry_delay_ms;
      const error = getString(event.error);
      const attemptText = typeof attempt === 'number' && typeof maxRetries === 'number'
        ? ` ${attempt}/${maxRetries}`
        : '';
      const delayText = typeof delay === 'number' ? ` in ${Math.round(delay / 1000)}s` : '';
      return [`Claude retrying API request${attemptText}${delayText}${error ? ` (${error})` : ''}`];
    }
    if (subtype === 'plugin_install') {
      const status = getString(event.status);
      const name = getString(event.name);
      return [`Claude plugin install ${status ?? 'updated'}${name ? `: ${name}` : ''}`];
    }
    if (subtype === 'status') {
      const status = preview(getPath(event, ['status', 'description']) ?? getPath(event, ['status', 'text']) ?? event.status);
      return status ? [`Claude status: ${status}`] : [];
    }
    if (subtype === 'hook_progress') {
      const name = getString(event.hook_name);
      const output = preview(event.output ?? event.stderr ?? event.stdout);
      return output ? [`Claude hook${name ? ` ${name}` : ''}: ${output}`] : [];
    }
    if (subtype === 'hook_response') {
      const outcome = getString(event.outcome);
      if (outcome && outcome !== 'success') {
        const name = getString(event.hook_name);
        const output = preview(event.stderr ?? event.output ?? event.stdout);
        return [`Claude hook ${outcome}${name ? `: ${name}` : ''}${output ? ` (${output})` : ''}`];
      }
    }
    return [];
  }

  private renderAssistantEvent(event: JsonObject): string[] {
    const content = event.content ?? getPath(event, ['message', 'content']);
    if (Array.isArray(content)) {
      return content.flatMap((part) => {
        if (!isObject(part)) {
          return [];
        }
        const partType = getString(part.type);
        if (partType === 'text') {
          const text = preview(part.text);
          return text ? [`Claude: ${text}`] : [];
        }
        if (partType === 'tool_use' || partType === 'server_tool_use') {
          return [`Claude using ${toolNameFrom(part) ?? 'a tool'}`];
        }
        return [];
      });
    }
    const text = preview(content);
    return text ? [`Claude: ${text}`] : [];
  }
}

export const claudeRunner = new ClaudeRunner();
