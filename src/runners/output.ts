import type { RunnerName } from '../config.js';

type JsonObject = Record<string, unknown>;

export interface ExtractedRunOutput {
  answer: string;
  stats?: Record<string, unknown>;
}

class TextAccumulator {
  private readonly parts: string[] = [];
  private streaming = '';

  append(text: string, delta = false) {
    if (!text) {
      return;
    }

    if (delta) {
      this.streaming += text;
      return;
    }

    this.flushStreaming();
    this.parts.push(text);
  }

  flushStreaming() {
    if (this.streaming) {
      this.parts.push(this.streaming);
      this.streaming = '';
    }
  }

  text(): string {
    this.flushStreaming();
    return normalizeAnswer(this.parts.join('\n\n'));
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function getPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (!isObject(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function normalizeAnswer(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fallbackAnswer(stdout: string): string {
  const normalized = normalizeAnswer(stdout);
  if (!normalized) {
    return '(no assistant answer captured)';
  }

  const maxLength = 4000;
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 3).trimEnd()}...`
    : normalized;
}

function parseJsonLines(stdout: string): JsonObject[] {
  const events: JsonObject[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isObject(parsed)) {
        events.push(parsed);
      }
    } catch {
      // Raw non-JSON output is handled by fallbackAnswer().
    }
  }
  return events;
}

function appendClaudeContent(accumulator: TextAccumulator, content: unknown) {
  if (Array.isArray(content)) {
    for (const part of content) {
      if (!isObject(part)) {
        continue;
      }
      if (part.type === 'text') {
        accumulator.append(getString(part.text) ?? '');
      }
    }
    return;
  }

  accumulator.append(getString(content) ?? '');
}

function extractClaude(events: JsonObject[]): ExtractedRunOutput | undefined {
  const accumulator = new TextAccumulator();
  let resultText: string | undefined;

  for (const event of events) {
    const type = getString(event.type);
    if (type === 'assistant') {
      appendClaudeContent(
        accumulator,
        event.content ?? getPath(event, ['message', 'content']),
      );
    } else if (type === 'streamlined_text') {
      accumulator.append(getString(event.text) ?? '', event.delta === true);
    } else if (type === 'stream_event') {
      const deltaType = getString(getPath(event, ['event', 'delta', 'type']));
      if (deltaType === 'text_delta') {
        accumulator.append(getString(getPath(event, ['event', 'delta', 'text'])) ?? '', true);
      }
    } else if (type === 'result') {
      resultText = getString(event.result) ?? resultText;
    }
  }

  const answer = normalizeAnswer(resultText ?? accumulator.text());
  return answer ? { answer } : undefined;
}

function extractGemini(events: JsonObject[]): ExtractedRunOutput | undefined {
  const accumulator = new TextAccumulator();
  let stats: Record<string, unknown> | undefined;

  for (const event of events) {
    if (event.type === 'message' && event.role === 'assistant') {
      accumulator.append(getString(event.content) ?? '', event.delta === true);
    } else if (event.type === 'result' && isObject(event.stats)) {
      stats = event.stats;
    }
  }

  const answer = accumulator.text();
  return answer ? { answer, ...(stats ? { stats } : {}) } : undefined;
}

function extractCodex(events: JsonObject[]): ExtractedRunOutput | undefined {
  const accumulator = new TextAccumulator();
  let stats: Record<string, unknown> | undefined;

  for (const event of events) {
    const type = getString(event.type);
    if (type === 'turn.completed' && isObject(event.usage)) {
      stats = event.usage;
    }

    if ((type === 'item.completed' || type === 'item.updated') && isObject(event.item)) {
      if (event.item.type === 'agent_message') {
        accumulator.append(getString(event.item.text) ?? '');
      }
    }

    if (isObject(event.msg) && event.msg.type === 'text') {
      accumulator.append(getString(event.msg.content) ?? '');
    }

    if (getString(event.method) === 'item/agentMessage/delta') {
      accumulator.append(getString(getPath(event, ['params', 'delta'])) ?? '', true);
    }
  }

  const answer = accumulator.text();
  return answer ? { answer, ...(stats ? { stats } : {}) } : undefined;
}

function extractOpenCode(events: JsonObject[]): ExtractedRunOutput | undefined {
  const accumulator = new TextAccumulator();
  let stats: Record<string, unknown> | undefined;

  for (const event of events) {
    if (event.type === 'text') {
      accumulator.append(getString(getPath(event, ['part', 'text']) ?? event.text) ?? '', event.delta === true);
    } else if (event.type === 'step_finish' && isObject(getPath(event, ['part', 'tokens']))) {
      stats = getPath(event, ['part', 'tokens']) as Record<string, unknown>;
    }
  }

  const answer = accumulator.text();
  return answer ? { answer, ...(stats ? { stats } : {}) } : undefined;
}

export function extractRunOutput(runner: RunnerName, stdout: string): ExtractedRunOutput {
  const events = parseJsonLines(stdout);
  const extracted = (() => {
    switch (runner) {
      case 'claude':
        return extractClaude(events);
      case 'gemini':
        return extractGemini(events);
      case 'codex':
        return extractCodex(events);
      case 'opencode':
        return extractOpenCode(events);
    }
  })();

  return extracted ?? { answer: fallbackAnswer(stdout) };
}
