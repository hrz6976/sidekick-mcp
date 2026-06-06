import { randomUUID } from 'node:crypto';

import type { AgentConfig, SidekickConfig, SidekickMode, WorktreeMode } from '../config.js';
import type { ToolExecutionContext } from '../execution.js';
import { getRunner } from '../runners/registry.js';
import { createWorktree } from '../worktrees/index.js';
import { TaskMetadataStore } from './metadataStore.js';

export interface SidekickTaskRunRequest {
  agentName: string;
  agentConfig: AgentConfig;
  prompt: string;
  title?: string;
  mode: SidekickMode;
  worktreeMode: WorktreeMode;
  effort?: string;
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
      ? { ...request.agentConfig, reasoningEffort: request.effort }
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
      title: request.title,
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

      const response = {
        taskId,
        status: 'completed',
        agent: request.agentName,
        runner: effectiveAgentConfig.runner,
        model: model || '(cli default)',
        ...(effectiveAgentConfig.reasoningEffort ? { effort: effectiveAgentConfig.reasoningEffort } : {}),
        mode: request.mode,
        worktree,
        logs: {
          stdout: metadata.stdoutPath,
          stderr: metadata.stderrPath,
          result: metadata.resultPath,
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
      await this.metadataStore.update(taskId, {
        status: executionContext.signal?.aborted ? 'cancelled' : 'failed',
        error: message,
      });
      throw error;
    }
  }

  private cleanupHint(taskId: string): string {
    return `When you are done inspecting or merging this worktree, call cleanup_worktree with taskId "${taskId}".`;
  }
}
