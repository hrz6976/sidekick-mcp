import { describe, expect, it } from 'vitest';

import { createCliProgressRenderer } from '../src/runners/progress.js';

describe('CLI progress renderer', () => {
  it('renders Claude stream-json events', () => {
    const renderer = createCliProgressRenderer('claude');

    expect(renderer.onChunk([
      JSON.stringify({ type: 'system', subtype: 'init', model: 'sonnet' }),
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'I will inspect the code.' },
            { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } },
          ],
        },
      }),
      JSON.stringify({
        type: 'system',
        subtype: 'api_retry',
        attempt: 1,
        max_retries: 3,
        retry_delay_ms: 2000,
        error: 'rate_limit',
      }),
      '',
    ].join('\n'))).toEqual([
      'Claude started (sonnet)',
      'Claude: I will inspect the code.',
      'Claude using Bash',
      'Claude retrying API request 1/3 in 2s (rate_limit)',
    ]);
  });

  it('renders Gemini stream-json events', () => {
    const renderer = createCliProgressRenderer('gemini');

    expect(renderer.onChunk([
      JSON.stringify({ type: 'init', model: 'gemini-2.5-pro' }),
      JSON.stringify({ type: 'message', role: 'user', content: 'ignored prompt' }),
      JSON.stringify({ type: 'message', role: 'assistant', content: 'I am checking that now.', delta: true }),
      JSON.stringify({ type: 'tool_use', name: 'read_file' }),
      JSON.stringify({ type: 'result', status: 'success', stats: { total_tokens: 1234, tool_calls: 1 } }),
      '',
    ].join('\n'))).toEqual([
      'Gemini started (gemini-2.5-pro)',
      'Gemini: I am checking that now.',
      'Gemini using read_file',
      'Gemini completed (1234 tokens, 1 tool calls)',
    ]);
  });

  it('renders current and legacy Codex JSON events', () => {
    const renderer = createCliProgressRenderer('codex');

    expect(renderer.onChunk([
      JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }),
      JSON.stringify({ type: 'turn.started' }),
      JSON.stringify({
        type: 'item.started',
        item: {
          id: 'cmd-1',
          type: 'command_execution',
          command: 'npm test',
          status: 'in_progress',
        },
      }),
      JSON.stringify({
        type: 'item.updated',
        item: {
          id: 'cmd-1',
          type: 'command_execution',
          command: 'npm test',
          aggregated_output: 'first line\nPASS tests\n',
          status: 'in_progress',
        },
      }),
      JSON.stringify({
        type: 'item.completed',
        item: {
          id: 'msg-1',
          type: 'agent_message',
          text: 'Tests pass.',
        },
      }),
      JSON.stringify({ msg: { type: 'text', content: 'legacy text event' } }),
      '',
    ].join('\n'))).toEqual([
      'Codex thread started',
      'Codex turn started',
      'Codex running command: npm test',
      'Codex command output: PASS tests',
      'Codex: Tests pass.',
      'Codex: legacy text event',
    ]);
  });

  it('renders OpenCode json events', () => {
    const renderer = createCliProgressRenderer('opencode');

    expect(renderer.onChunk([
      JSON.stringify({ type: 'step_start', part: { type: 'step-start' } }),
      JSON.stringify({ type: 'reasoning', part: { type: 'reasoning', text: 'Need to inspect tests.' } }),
      JSON.stringify({
        type: 'tool_use',
        part: {
          type: 'tool',
          tool: 'bash',
          state: {
            status: 'completed',
            title: 'Run tests',
            output: 'setup\nPASS\n',
            metadata: { exit: 0 },
          },
        },
      }),
      JSON.stringify({ type: 'text', part: { type: 'text', text: 'Done.' } }),
      JSON.stringify({ type: 'step_finish', part: { type: 'step-finish', reason: 'stop', tokens: { total: 42, input: 30, output: 12 } } }),
      '',
    ].join('\n'))).toEqual([
      'OpenCode step started',
      'OpenCode is reasoning...',
      'OpenCode tool completed: bash (Run tests) exit 0: PASS',
      'OpenCode: Done.',
      'OpenCode step completed (42 tokens)',
    ]);
  });

  it('buffers partial lines and falls back for non-json output', () => {
    const renderer = createCliProgressRenderer('gemini');

    expect(renderer.onChunk('{"type":"message","role":"assistant"')).toEqual([]);
    expect(renderer.onChunk(',"content":"partial ok"}\nplain progress')).toEqual([
      'Gemini: partial ok',
    ]);
    expect(renderer.flush()).toEqual(['gemini: plain progress']);
  });
});
