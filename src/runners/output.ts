export type JsonObject = Record<string, unknown>;

export interface ExtractedRunOutput {
  answer: string;
  stats?: Record<string, unknown>;
}

export class TextAccumulator {
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

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

export function getPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (!isObject(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

export function normalizeAnswer(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function fallbackAnswer(stdout: string): string {
  const normalized = normalizeAnswer(stdout);
  if (!normalized) {
    return '(no assistant answer captured)';
  }

  const maxLength = 4000;
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 3).trimEnd()}...`
    : normalized;
}

export function parseJsonLines(stdout: string): JsonObject[] {
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
