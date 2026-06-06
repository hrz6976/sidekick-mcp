import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { AgentConfig, SidekickConfig, SidekickMode, WorktreeMode } from '../config.js';
import type { ToolExecutionContext } from '../execution.js';
import { getRunner } from '../runners/registry.js';
import { buildSidekickTrajectory, writeSidekickTrajectory } from '../runners/trajectory.js';
import { createWorktree } from '../worktrees/index.js';
import { TaskMetadataStore } from './metadataStore.js';

export interface SidekickTaskRunRequest {
  agentName: string;
  agentConfig: AgentConfig;
  prompt: string;
  mode: SidekickMode;
  worktreeMode: WorktreeMode;
  effort?: string;
  trajectory?: boolean | string;
  context?: ToolExecutionContext;
}

export class TaskRunCoordinator {
  constructor(
    private readonly config: SidekickConfig,
    private readonly metadataStore: TaskMetadataStore,
  ) {}

  async run(request: SidekickTaskRunRequest): Promise<unknown> {
    const taskId = request.context?.taskId ?? randomUUID();
    const executionContext: ToolExecutionContext = { ...request.context, taskId };
    const effectiveAgentConfig = request.effort
      ? { ...request.agentConfig, effort: request.effort }
      : request.agentConfig;
    const model = request.agentConfig.model ?? '';
    const baseCwd = executionContext.cwd ?? process.cwd();
    const runner = getRunner(effectiveAgentConfig.runner);

    const worktree = await createWorktree({
      agent: request.agentConfig.runner,
      taskId,
      baseCwd,
      mode: request.worktreeMode,
      worktreeSupport: runner.worktreeSupport,
      worktreeRootDir: this.config.worktreeRootDir,
      context: executionContext,
    });

    const metadata = await this.metadataStore.create({
      taskId,
      status: 'running',
      agent: request.agentName,
      runner: request.agentConfig.runner,
      model,
      mode: request.mode,
      baseCwd,
      worktree,
    });

    const progressRenderer = runner.createProgressRenderer();
    let capturedStdout = '';
    const progress = (chunk: string) => {
      capturedStdout += chunk;
      void this.metadataStore.appendStdout(taskId, chunk);
      for (const message of progressRenderer.onChunk(chunk)) {
        executionContext.onProgress?.(message);
      }
    };

    try {
      const result = await runner.run({
        agent: effectiveAgentConfig.runner,
        model,
        prompt: request.prompt,
        mode: request.mode,
        cwd: worktree.cwd,
        env: executionContext.env,
        agentConfig: effectiveAgentConfig,
        worktree,
        context: {
          ...executionContext,
          cwd: worktree.cwd,
          onProgress: progress,
        },
      });

      if (result.stdout && capturedStdout !== result.stdout) {
        const missingStdout = result.stdout.startsWith(capturedStdout)
          ? result.stdout.slice(capturedStdout.length)
          : `${capturedStdout ? '\n' : ''}${result.stdout}`;
        await this.metadataStore.appendStdout(taskId, missingStdout);
      }
      for (const message of progressRenderer.flush()) {
        executionContext.onProgress?.(message);
      }
      const extracted = runner.extractOutput(result.stdout);
      await this.metadataStore.update(taskId, {
        status: 'completed',
        exitCode: result.exitCode,
      });
      const trajectoryPath = await this.writeTrajectoryIfRequested({
        trajectory: request.trajectory,
        metadata,
        prompt: request.prompt,
        stdout: result.stdout,
        answer: extracted.answer,
        status: 'completed',
        stats: extracted.stats,
        effort: effectiveAgentConfig.effort,
      });

      const response = {
        taskId,
        status: 'completed',
        agent: request.agentName,
        runner: effectiveAgentConfig.runner,
        model: model || '(cli default)',
        ...(effectiveAgentConfig.effort ? { effort: effectiveAgentConfig.effort } : {}),
        mode: request.mode,
        worktree,
        logs: {
          stdout: metadata.stdoutPath,
          stderr: metadata.stderrPath,
          result: metadata.resultPath,
          ...(trajectoryPath ? { trajectory: trajectoryPath } : {}),
        },
        cleanupHint: this.cleanupHint(taskId),
        answer: extracted.answer,
        ...(extracted.stats ? { stats: extracted.stats } : {}),
      };
      await this.metadataStore.writeResult(taskId, response);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.metadataStore.appendStderr(taskId, `${message}\n`);
      const updatedMetadata = await this.metadataStore.update(taskId, {
        status: executionContext.signal?.aborted ? 'cancelled' : 'failed',
        error: message,
      });
      await this.writeTrajectoryIfRequested({
        trajectory: request.trajectory,
        metadata: updatedMetadata,
        prompt: request.prompt,
        stdout: capturedStdout || await this.readFileIfExists(metadata.stdoutPath),
        status: executionContext.signal?.aborted ? 'cancelled' : 'failed',
        error: message,
        effort: effectiveAgentConfig.effort,
      });
      throw error;
    }
  }

  private async writeTrajectoryIfRequested(request: {
    trajectory?: boolean | string;
    metadata: Awaited<ReturnType<TaskMetadataStore['create']>>;
    prompt: string;
    stdout: string;
    answer?: string;
    status: 'completed' | 'failed' | 'cancelled' | 'interrupted';
    error?: string;
    stats?: Record<string, unknown>;
    effort?: string;
  }): Promise<string | undefined> {
    if (!request.trajectory) {
      return undefined;
    }

    const trajectoryPath = request.trajectory === true
      ? path.join(request.metadata.taskDir, 'trajectory.json')
      : path.resolve(request.metadata.baseCwd, request.trajectory);
    const runner = getRunner(request.metadata.runner);
    const fallbackTimestamp = new Date().toISOString();
    const trajectory = buildSidekickTrajectory({
      taskId: request.metadata.taskId,
      agent: request.metadata.agent,
      runner: request.metadata.runner,
      model: request.metadata.model,
      mode: request.metadata.mode,
      prompt: request.prompt,
      runnerSteps: runner.buildTrajectorySteps({
        stdout: request.stdout,
        model: request.metadata.model,
        effort: request.effort,
        fallbackTimestamp,
      }),
      answer: request.answer,
      status: request.status,
      error: request.error,
      stats: request.stats,
      effort: request.effort,
      baseCwd: request.metadata.baseCwd,
      worktreeCwd: request.metadata.worktree.cwd,
    });
    await writeSidekickTrajectory(trajectoryPath, trajectory);
    return trajectoryPath;
  }

  private async readFileIfExists(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch {
      return '';
    }
  }

  private cleanupHint(taskId: string): string {
    return `When you are done inspecting or merging this worktree, call cleanup_worktree with taskId "${taskId}".`;
  }
}
