import fs from 'node:fs/promises';
import path from 'node:path';

import type { RunnerName, SidekickMode } from '../config.js';
import { normalizeAnswer } from './output.js';

export type TrajectorySource = 'system' | 'user' | 'agent';

export interface TrajectoryToolCall {
  tool_call_id: string;
  function_name: string;
  arguments: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

export interface TrajectoryObservationResult {
  source_call_id?: string | null;
  content?: string | null;
  extra?: Record<string, unknown>;
}

export interface TrajectoryObservation {
  results: TrajectoryObservationResult[];
}

export interface TrajectoryMetrics {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  cached_tokens?: number | null;
  cost_usd?: number | null;
  extra?: Record<string, unknown>;
}

export interface TrajectoryStep {
  step_id: number;
  timestamp?: string | null;
  source: TrajectorySource;
  model_name?: string | null;
  reasoning_effort?: string | number | null;
  message: string;
  reasoning_content?: string | null;
  tool_calls?: TrajectoryToolCall[] | null;
  observation?: TrajectoryObservation | null;
  metrics?: TrajectoryMetrics | null;
  llm_call_count?: number | null;
  extra?: Record<string, unknown>;
}

export interface TrajectoryAgent {
  name: string;
  version: string;
  model_name?: string | null;
  extra?: Record<string, unknown>;
}

export interface TrajectoryFinalMetrics {
  total_prompt_tokens?: number | null;
  total_completion_tokens?: number | null;
  total_cached_tokens?: number | null;
  total_cost_usd?: number | null;
  total_steps?: number | null;
  extra?: Record<string, unknown>;
}

export interface SidekickTrajectory {
  schema_version: 'ATIF-v1.7';
  session_id: string;
  trajectory_id: string;
  agent: TrajectoryAgent;
  steps: TrajectoryStep[];
  notes?: string | null;
  final_metrics?: TrajectoryFinalMetrics | null;
  extra?: Record<string, unknown>;
}

export interface BuildTrajectoryStepsRequest {
  stdout: string;
  model: string;
  effort?: string;
  fallbackTimestamp: string;
}

export interface BuildSidekickTrajectoryRequest {
  taskId: string;
  agent: string;
  runner: RunnerName;
  model: string;
  mode: SidekickMode;
  prompt: string;
  runnerSteps: TrajectoryStep[];
  answer?: string;
  status: 'completed' | 'failed' | 'cancelled' | 'interrupted';
  error?: string;
  stats?: Record<string, unknown>;
  effort?: string;
  baseCwd?: string;
  worktreeCwd?: string;
}

export function buildSidekickTrajectory(request: BuildSidekickTrajectoryRequest): SidekickTrajectory {
  const now = new Date().toISOString();
  const steps: TrajectoryStep[] = [
    {
      step_id: 1,
      timestamp: now,
      source: 'user',
      message: request.prompt,
    },
    ...request.runnerSteps,
  ];

  if (request.status === 'completed') {
    steps.push({
      step_id: steps.length + 1,
      timestamp: now,
      source: 'agent',
      model_name: trajectoryModelName(request.model),
      ...(request.effort ? { reasoning_effort: request.effort } : {}),
      message: normalizeAnswer(request.answer ?? '') || '(no assistant answer captured)',
      llm_call_count: 1,
      extra: { kind: 'final_answer' },
    });
  } else {
    steps.push({
      step_id: steps.length + 1,
      timestamp: now,
      source: 'agent',
      model_name: trajectoryModelName(request.model),
      message: `Sidekick run ${request.status}: ${request.error ?? 'Unknown error'}`,
      observation: {
        results: [
          {
            content: request.error ?? 'Unknown error',
            extra: { status: request.status },
          },
        ],
      },
      llm_call_count: 0,
      extra: { kind: 'error', status: request.status },
    });
  }

  const renumberedSteps = steps.map((step, index) => ({ ...step, step_id: index + 1 }));
  return {
    schema_version: 'ATIF-v1.7',
    session_id: request.taskId,
    trajectory_id: request.taskId,
    agent: {
      name: request.agent,
      version: 'sidekick',
      model_name: trajectoryModelName(request.model),
      extra: {
        runner: request.runner,
        mode: request.mode,
        ...(request.effort ? { effort: request.effort } : {}),
      },
    },
    steps: renumberedSteps,
    final_metrics: finalMetrics(request.stats, renumberedSteps.length),
    notes: 'Experimental ATIF trajectory exported by Sidekick.',
    extra: {
      task_id: request.taskId,
      status: request.status,
      runner: request.runner,
      ...(request.baseCwd ? { base_cwd: request.baseCwd } : {}),
      ...(request.worktreeCwd ? { worktree_cwd: request.worktreeCwd } : {}),
      ...(request.error ? { error: request.error } : {}),
      ...(request.answer ? { answer: request.answer } : {}),
    },
  };
}

export async function writeSidekickTrajectory(filePath: string, trajectory: SidekickTrajectory): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(trajectory, null, 2)}\n`, 'utf8');
}

export function trajectoryModelName(model: string): string | null {
  return model && model !== '(cli default)' ? model : null;
}

export function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
}

export function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function pathValue(root: unknown, segments: string[]): unknown {
  let current = root;
  for (const segment of segments) {
    const record = objectValue(current);
    if (!record) {
      return undefined;
    }
    current = record[segment];
  }
  return current;
}

export function millisToIso(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value).toISOString()
    : undefined;
}

export function stringifyTrajectoryValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

export function agentTextStep(
  request: BuildTrajectoryStepsRequest,
  text: string,
  timestamp: string,
  extra?: Record<string, unknown>,
): TrajectoryStep {
  const reasoningContent = typeof extra?.reasoning_content === 'string'
    ? extra.reasoning_content
    : undefined;
  const cleanExtra = compactRecord({ ...extra, reasoning_content: undefined });
  return {
    step_id: 1,
    timestamp,
    source: 'agent',
    model_name: trajectoryModelName(request.model),
    ...(request.effort ? { reasoning_effort: request.effort } : {}),
    message: text,
    ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
    llm_call_count: 1,
    ...(Object.keys(cleanExtra).length ? { extra: cleanExtra } : {}),
  };
}

export function agentToolStep(
  request: BuildTrajectoryStepsRequest,
  data: {
    timestamp: string;
    message: string;
    callId: string;
    functionName: string;
    arguments: Record<string, unknown>;
    output?: string;
    extra?: Record<string, unknown>;
  },
): TrajectoryStep {
  const observation = data.output
    ? { results: [{ source_call_id: data.callId, content: data.output }] }
    : undefined;
  return {
    step_id: 1,
    timestamp: data.timestamp,
    source: 'agent',
    model_name: trajectoryModelName(request.model),
    ...(request.effort ? { reasoning_effort: request.effort } : {}),
    message: data.message,
    tool_calls: [{
      tool_call_id: data.callId,
      function_name: data.functionName,
      arguments: data.arguments,
    }],
    ...(observation ? { observation } : {}),
    llm_call_count: 0,
    ...(data.extra && Object.keys(data.extra).length ? { extra: data.extra } : {}),
  };
}

function finalMetrics(stats: Record<string, unknown> | undefined, totalSteps: number): TrajectoryFinalMetrics {
  const promptTokens = numberValue(
    pathValue(stats, ['prompt_tokens'])
    ?? pathValue(stats, ['input_tokens'])
    ?? pathValue(stats, ['input'])
    ?? pathValue(stats, ['tokens', 'input']),
  );
  const completionTokens = numberValue(
    pathValue(stats, ['completion_tokens'])
    ?? pathValue(stats, ['output_tokens'])
    ?? pathValue(stats, ['output'])
    ?? pathValue(stats, ['tokens', 'output']),
  );
  const cachedTokens = numberValue(
    pathValue(stats, ['cached_tokens'])
    ?? pathValue(stats, ['cached_input_tokens'])
    ?? pathValue(stats, ['cache_read_tokens'])
    ?? pathValue(stats, ['tokens', 'cached'])
    ?? pathValue(stats, ['cache', 'read']),
  );
  const cost = numberValue(
    pathValue(stats, ['cost_usd'])
    ?? pathValue(stats, ['total_cost_usd'])
    ?? pathValue(stats, ['cost']),
  );

  return {
    total_prompt_tokens: promptTokens ?? null,
    total_completion_tokens: completionTokens ?? null,
    total_cached_tokens: cachedTokens ?? null,
    total_cost_usd: cost ?? null,
    total_steps: totalSteps,
    ...(stats && Object.keys(stats).length ? { extra: { raw_stats: stats } } : {}),
  };
}
