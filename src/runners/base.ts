import type { AgentConfig, RunnerName } from '../config.js';
import type { ToolExecutionContext } from '../execution.js';
import { executeCommand } from '../utils/commandExecutor.js';
import type { ExtractedRunOutput } from './output.js';
import type { CliProgressRenderer } from './progress.js';
import type { BuildTrajectoryStepsRequest, TrajectoryStep } from './trajectory.js';
import type { AgentRunner, RunRequest, RunResult } from './types.js';

export abstract class BaseRunner implements AgentRunner {
  abstract readonly name: RunnerName;
  abstract readonly fallbackModels: string[];
  abstract readonly modelDiscoveryDescription: string;
  readonly fallbackRecommendationModels: string[] = [];
  readonly worktreeSupport: 'native' | 'managed' = 'managed';

  get defaultCommand(): string {
    return this.name;
  }

  async listModels(
    config: AgentConfig,
    context?: ToolExecutionContext,
  ): Promise<string[]> {
    if (config.models?.length) {
      return config.models;
    }
    return this.discoverModels(config, context);
  }

  async run(request: RunRequest): Promise<RunResult> {
    const args = this.buildArgs(request);
    const stdout = await executeCommand(request.agentConfig.command, args, {
      ...request.context,
      cwd: request.cwd,
      env: request.env,
    });
    return {
      stdout,
      stderr: '',
      exitCode: 0,
      command: request.agentConfig.command,
      args,
    };
  }

  abstract buildArgs(request: RunRequest): string[];
  abstract extractOutput(stdout: string): ExtractedRunOutput;
  abstract createProgressRenderer(): CliProgressRenderer;
  abstract validateEffort(effort?: string): void;

  buildTrajectorySteps(_request: BuildTrajectoryStepsRequest): TrajectoryStep[] {
    return [];
  }

  recommendedAgents(models: string[]): Record<string, unknown> {
    const model = models.find((candidate) => candidate.trim());
    return {
      [this.name]: {
        runner: this.name,
        ...(model ? { model } : {}),
        extraArgs: [],
        description: `Ask ${this.name} for helper-agent tasks.`,
      },
    };
  }

  protected async discoverModels(
    _config: AgentConfig,
    _context?: ToolExecutionContext,
  ): Promise<string[]> {
    return this.fallbackModels;
  }

  protected appendPrompt(args: string[], prompt: string): string[] {
    return [...args, '--', prompt];
  }

  protected hasArg(args: string[], flag: string): boolean {
    return args.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
  }

  protected hasConfigOverride(args: string[], key: string): boolean {
    return args.some((arg, index) => {
      if ((arg === '-c' || arg === '--config') && args[index + 1]?.startsWith(`${key}=`)) {
        return true;
      }
      return arg.startsWith(`-c=${key}=`) || arg.startsWith(`--config=${key}=`);
    });
  }

  protected validateNoEffort(effort?: string): void {
    if (effort) {
      throw new Error(`Runner "${this.name}" does not support effort overrides.`);
    }
  }

  protected validateEnumEffort(effort: string | undefined, validValues: readonly string[]): void {
    if (!effort) {
      return;
    }
    if (!validValues.includes(effort)) {
      throw new Error(
        `Runner "${this.name}" effort must be one of: ${validValues.join(', ')}.`,
      );
    }
  }

  protected uniqueModels(models: string[]): string[] {
    return models.filter((model, index) => model && models.indexOf(model) === index);
  }
}
