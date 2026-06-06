import { describe, expect, it } from 'vitest';

import { getRunner } from '../src/runners/registry.js';

describe('CLI output extraction', () => {
  it('extracts Claude final result text when available', () => {
    const output = getRunner('claude').extractOutput([
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'intermediate text' }] },
      }),
      JSON.stringify({ type: 'result', result: 'final answer' }),
      '',
    ].join('\n'));

    expect(output).toEqual({ answer: 'final answer' });
  });

  it('concatenates Gemini streamed assistant deltas and stats', () => {
    const output = getRunner('gemini').extractOutput([
      JSON.stringify({ type: 'init', model: 'gemini-3.1-pro-preview' }),
      JSON.stringify({ type: 'message', role: 'assistant', content: 'Hello', delta: true }),
      JSON.stringify({ type: 'message', role: 'assistant', content: ' world.', delta: true }),
      JSON.stringify({ type: 'result', status: 'success', stats: { total_tokens: 42 } }),
      '',
    ].join('\n'));

    expect(output).toEqual({
      answer: 'Hello world.',
      stats: { total_tokens: 42 },
    });
  });

  it('extracts Codex agent messages and usage', () => {
    const output = getRunner('codex').extractOutput([
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Tests pass.' } }),
      JSON.stringify({ type: 'turn.completed', usage: { total_tokens: 99 } }),
      '',
    ].join('\n'));

    expect(output).toEqual({
      answer: 'Tests pass.',
      stats: { total_tokens: 99 },
    });
  });

  it('extracts OpenCode text parts and token stats', () => {
    const output = getRunner('opencode').extractOutput([
      JSON.stringify({ type: 'text', part: { type: 'text', text: 'Done.' } }),
      JSON.stringify({ type: 'step_finish', part: { tokens: { total: 12 } } }),
      '',
    ].join('\n'));

    expect(output).toEqual({
      answer: 'Done.',
      stats: { total: 12 },
    });
  });

  it('falls back to trimmed non-json output without returning unlimited text', () => {
    const output = getRunner('claude').extractOutput('plain answer\n');

    expect(output).toEqual({ answer: 'plain answer' });
  });
});
