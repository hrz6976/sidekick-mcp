import { describe, expect, it } from 'vitest';

import { codexRunner } from '../src/runners/codex.js';
import { buildSidekickTrajectory } from '../src/runners/trajectory.js';

describe('Trajectory ATIF export', () => {
  it('emits a valid completed trajectory with sequential steps and final metrics', () => {
    const stdout = [
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'msg-1', type: 'agent_message', text: 'intermediate answer' },
      }),
      JSON.stringify({
        type: 'item.completed',
        item: {
          id: 'cmd-1',
          type: 'command_execution',
          command: 'pwd',
          aggregated_output: '/repo',
          exit_code: 0,
          status: 'completed',
        },
      }),
    ].join('\n');
    const runnerSteps = codexRunner.buildTrajectorySteps({
      stdout,
      model: 'gpt-test',
      fallbackTimestamp: '2026-01-01T00:00:00.000Z',
    });

    const trajectory = buildSidekickTrajectory({
      taskId: 'task-1',
      agent: 'codex_peer',
      runner: 'codex',
      model: 'gpt-test',
      mode: 'read-only',
      prompt: 'Solve this task.',
      runnerSteps,
      answer: 'final answer',
      status: 'completed',
      stats: {
        prompt_tokens: 12,
        completion_tokens: 5,
        cached_tokens: 3,
        cost_usd: 0.01,
      },
    });

    expect(trajectory.schema_version).toBe('ATIF-v1.7');
    expect(trajectory.session_id).toBe('task-1');
    expect(trajectory.trajectory_id).toBe('task-1');
    expect(trajectory.agent).toEqual(expect.objectContaining({
      name: 'codex_peer',
      version: 'sidekick',
      model_name: 'gpt-test',
    }));
    expect(trajectory.steps.map((step) => step.step_id)).toEqual([1, 2, 3, 4]);
    expect(trajectory.steps[0]).toEqual(expect.objectContaining({
      source: 'user',
      message: 'Solve this task.',
    }));
    expect(trajectory.steps[2].tool_calls?.[0]).toEqual(expect.objectContaining({
      tool_call_id: 'cmd-1',
      function_name: 'command_execution',
      arguments: { command: 'pwd' },
    }));
    expect(trajectory.steps[2].observation?.results[0]).toEqual(expect.objectContaining({
      source_call_id: 'cmd-1',
      content: '/repo',
    }));
    expect(trajectory.steps.at(-1)).toEqual(expect.objectContaining({
      source: 'agent',
      message: 'final answer',
      extra: { kind: 'final_answer' },
    }));
    expect(trajectory.final_metrics).toEqual(expect.objectContaining({
      total_prompt_tokens: 12,
      total_completion_tokens: 5,
      total_cached_tokens: 3,
      total_cost_usd: 0.01,
      total_steps: 4,
    }));
  });

  it('emits an error trajectory for failed runs', () => {
    const trajectory = buildSidekickTrajectory({
      taskId: 'task-2',
      agent: 'gemini',
      runner: 'gemini',
      model: '',
      mode: 'read-only',
      prompt: 'Fail safely.',
      runnerSteps: [],
      status: 'failed',
      error: 'Command failed with exit code 1: boom',
    });

    expect(trajectory.agent.model_name).toBeNull();
    expect(trajectory.steps).toHaveLength(2);
    expect(trajectory.steps[1]).toEqual(expect.objectContaining({
      source: 'agent',
      message: 'Sidekick run failed: Command failed with exit code 1: boom',
      llm_call_count: 0,
      extra: { kind: 'error', status: 'failed' },
    }));
    expect(trajectory.steps[1].observation?.results[0].content).toBe('Command failed with exit code 1: boom');
  });
});
