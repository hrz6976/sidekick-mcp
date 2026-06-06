import fs from 'node:fs/promises';
import path from 'node:path';

import type { RunnerName, SidekickMode } from '../config.js';
import type { WorktreeHandle } from '../worktrees/types.js';

export type SidekickTaskStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';

export interface SidekickTaskMetadata {
  taskId: string;
  status: SidekickTaskStatus;
  agent: string;
  runner: RunnerName;
  model: string;
  mode: SidekickMode;
  baseCwd: string;
  taskDir: string;
  stdoutPath: string;
  stderrPath: string;
  resultPath: string;
  worktree: WorktreeHandle;
  createdAt: string;
  updatedAt: string;
  exitCode?: number | null;
  error?: string;
}

export class TaskMetadataStore {
  constructor(private readonly taskRootDir: string) {}

  getTaskDir(taskId: string): string {
    return path.join(this.taskRootDir, taskId);
  }

  getMetadataPath(taskId: string): string {
    return path.join(this.getTaskDir(taskId), 'metadata.json');
  }

  async create(metadata: Omit<SidekickTaskMetadata, 'taskDir' | 'stdoutPath' | 'stderrPath' | 'resultPath' | 'createdAt' | 'updatedAt'>): Promise<SidekickTaskMetadata> {
    const taskDir = this.getTaskDir(metadata.taskId);
    await fs.mkdir(taskDir, { recursive: true });
    const now = new Date().toISOString();
    const full: SidekickTaskMetadata = {
      ...metadata,
      taskDir,
      stdoutPath: path.join(taskDir, 'stdout.log'),
      stderrPath: path.join(taskDir, 'stderr.log'),
      resultPath: path.join(taskDir, 'result.json'),
      createdAt: now,
      updatedAt: now,
    };
    await fs.writeFile(full.stdoutPath, '', 'utf8');
    await fs.writeFile(full.stderrPath, '', 'utf8');
    await this.write(full);
    return full;
  }

  async read(taskId: string): Promise<SidekickTaskMetadata | undefined> {
    try {
      const raw = await fs.readFile(this.getMetadataPath(taskId), 'utf8');
      return JSON.parse(raw) as SidekickTaskMetadata;
    } catch {
      return undefined;
    }
  }

  async findByWorktreeId(worktreeId: string): Promise<SidekickTaskMetadata | undefined> {
    await fs.mkdir(this.taskRootDir, { recursive: true });
    const entries = await fs.readdir(this.taskRootDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const metadata = await this.read(entry.name);
      if (metadata?.worktree.id === worktreeId) {
        return metadata;
      }
    }
    return undefined;
  }

  async update(taskId: string, patch: Partial<SidekickTaskMetadata>): Promise<SidekickTaskMetadata> {
    const current = await this.read(taskId);
    if (!current) {
      throw new Error(`No Sidekick metadata exists for task "${taskId}".`);
    }
    const next = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await this.write(next);
    return next;
  }

  async writeResult(taskId: string, result: unknown): Promise<void> {
    const metadata = await this.read(taskId);
    if (!metadata) {
      throw new Error(`No Sidekick metadata exists for task "${taskId}".`);
    }
    await fs.writeFile(metadata.resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }

  async appendStdout(taskId: string, chunk: string): Promise<void> {
    const metadata = await this.read(taskId);
    if (metadata) {
      await fs.appendFile(metadata.stdoutPath, chunk, 'utf8');
    }
  }

  async appendStderr(taskId: string, chunk: string): Promise<void> {
    const metadata = await this.read(taskId);
    if (metadata) {
      await fs.appendFile(metadata.stderrPath, chunk, 'utf8');
    }
  }

  async markInterruptedRunningTasks(): Promise<void> {
    await fs.mkdir(this.taskRootDir, { recursive: true });
    const entries = await fs.readdir(this.taskRootDir, { withFileTypes: true });
    await Promise.all(entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const metadata = await this.read(entry.name);
        if (metadata?.status === 'running') {
          await this.update(entry.name, {
            status: 'interrupted',
            error: 'Sidekick server restarted before this task completed.',
          });
        }
      }));
  }

  private async write(metadata: SidekickTaskMetadata): Promise<void> {
    await fs.mkdir(metadata.taskDir, { recursive: true });
    await fs.writeFile(
      this.getMetadataPath(metadata.taskId),
      `${JSON.stringify(metadata, null, 2)}\n`,
      'utf8',
    );
  }
}
