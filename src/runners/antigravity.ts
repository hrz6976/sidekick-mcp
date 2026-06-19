import type { AgentConfig, SidekickMode } from '../config.js';
import type { ToolExecutionContext } from '../execution.js';
import { executeCommand } from '../utils/commandExecutor.js';
import { BaseRunner } from './base.js';
import {
  fallbackAnswer,
  type ExtractedRunOutput,
} from './output.js';
import {
  createJsonLineProgressRenderer,
  type CliProgressRenderer,
} from './progress.js';
import type { RunRequest } from './types.js';

function shouldUseSandbox(mode: SidekickMode): boolean {
  return mode === 'read-only';
}

function shouldSkipPermissions(mode: SidekickMode): boolean {
  return mode === 'full-access';
}

function hasPermissionMode(args: string[]): boolean {
  return args.some((arg) => arg === '--sandbox' || arg === '--dangerously-skip-permissions');
}

function parseAntigravityModels(output: string): string[] {
  const ignored = new Set(['model', 'models', 'name', 'id', 'available', 'available models']);
  const models = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[*•\-\s]+/, ''))
    .map((line) => line.replace(/\s{2,}.*$/, '').trim())
    .filter((model) => model.length > 0)
    .filter((model) => !ignored.has(model.toLowerCase()))
    .filter((model) => /^[a-zA-Z0-9][a-zA-Z0-9._:/+() -]*$/.test(model));
  return models.filter((model, index) => models.indexOf(model) === index);
}

export class AntigravityRunner extends BaseRunner {
  readonly name = 'antigravity';
  readonly fallbackModels: string[] = [];
  readonly fallbackRecommendationModels = ['auto'];
  readonly modelDiscoveryDescription = '`agy models` local Antigravity CLI model listing; falls back to configured models when discovery is unavailable';

  get defaultCommand(): string {
    return 'agy';
  }

  recommendedAgents(models: string[]): Record<string, unknown> {
    const model = models.find((candidate) => candidate.trim());
    return {
      antigravity: {
        runner: 'antigravity',
        ...(model ? { model } : {}),
        extraArgs: [],
        description: 'Ask Google Antigravity CLI for coding-agent help.',
      },
    };
  }

  extractOutput(stdout: string): ExtractedRunOutput {
    return { answer: fallbackAnswer(stdout) };
  }

  createProgressRenderer(): CliProgressRenderer {
    return createJsonLineProgressRenderer('Antigravity', () => []);
  }

  validateEffort(effort?: string): void {
    this.validateNoEffort(effort);
  }

  buildArgs(request: RunRequest): string[] {
    const args = [...request.agentConfig.extraArgs];
    if (shouldUseSandbox(request.mode) && !hasPermissionMode(args)) {
      args.push('--sandbox');
    }
    if (
      shouldSkipPermissions(request.mode)
      && !hasPermissionMode(args)
    ) {
      args.push('--dangerously-skip-permissions');
    }
    if (request.model) {
      args.push('--model', request.model);
    }
    args.push('--print', request.prompt);
    return args;
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
      return parseAntigravityModels(output);
    } catch {
      return this.fallbackModels;
    }
  }
}

export const antigravityRunner = new AntigravityRunner();
