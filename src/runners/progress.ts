export interface CliProgressRenderer {
  onChunk(chunk: string): string[];
  flush(): string[];
}

export type JsonObject = Record<string, unknown>;

const MAX_PROGRESS_MESSAGE_LENGTH = 180;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function preview(value: unknown, maxLength = MAX_PROGRESS_MESSAGE_LENGTH): string | undefined {
  const raw = typeof value === 'string' ? value : value === undefined ? undefined : JSON.stringify(value);
  const normalized = raw?.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
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

export function formatTokenStats(stats: unknown): string | undefined {
  if (!isObject(stats)) {
    return undefined;
  }
  const total = stats.total_tokens ?? stats.totalTokens ?? stats.total;
  const input = stats.input_tokens ?? stats.inputTokens ?? stats.input;
  const output = stats.output_tokens ?? stats.outputTokens ?? stats.output;
  const parts: string[] = [];
  if (typeof total === 'number') {
    parts.push(`${total} tokens`);
  } else {
    if (typeof input === 'number') {
      parts.push(`${input} input`);
    }
    if (typeof output === 'number') {
      parts.push(`${output} output`);
    }
  }
  const toolCalls = stats.tool_calls ?? stats.toolCalls;
  if (typeof toolCalls === 'number' && toolCalls > 0) {
    parts.push(`${toolCalls} tool calls`);
  }
  return parts.length ? parts.join(', ') : undefined;
}

export function lastMeaningfulLine(value: unknown, maxLength = 120): string | undefined {
  const text = typeof value === 'string' ? value : undefined;
  if (!text) {
    return undefined;
  }
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return preview(lines.at(-1), maxLength);
}

export function toolNameFrom(value: unknown): string | undefined {
  return getString(getPath(value, ['name']))
    ?? getString(getPath(value, ['tool']))
    ?? getString(getPath(value, ['tool_name']))
    ?? getString(getPath(value, ['function', 'name']))
    ?? getString(getPath(value, ['input', 'name']));
}

export function createJsonLineProgressRenderer(
  runnerLabel: string,
  renderEvent: (event: JsonObject) => string[],
): CliProgressRenderer {
  let buffer = '';

  const renderLine = (line: string): string[] => {
    const trimmed = line.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isObject(parsed)) {
        return renderEvent(parsed);
      }
    } catch {
      // Fall through to raw line preview for non-JSON output.
    }

    const rawPreview = preview(trimmed);
    return rawPreview ? [`${runnerLabel}: ${rawPreview}`] : [];
  };

  return {
    onChunk(chunk: string): string[] {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      return lines.flatMap(renderLine);
    },
    flush(): string[] {
      const remaining = buffer;
      buffer = '';
      return remaining ? renderLine(remaining) : [];
    },
  };
}
