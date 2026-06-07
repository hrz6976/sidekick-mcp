export interface CliProgressRenderer {
  onChunk(chunk: string): string[];
  flush(): string[];
}

export type JsonObject = Record<string, unknown>;

const MAX_PROGRESS_MESSAGE_LENGTH = 180;
const MAX_TOOL_SUMMARY_LENGTH = 90;

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
    ?? getString(getPath(value, ['tool_name']))
    ?? getString(getPath(value, ['tool']))
    ?? getString(getPath(value, ['part', 'tool']))
    ?? getString(getPath(value, ['part', 'name']))
    ?? getString(getPath(value, ['function', 'name']))
    ?? getString(getPath(value, ['input', 'name']));
}

export interface ToolProgressInfo {
  id?: string;
  name?: string;
  summary?: string;
}

export function toolIdFrom(value: unknown): string | undefined {
  return getString(getPath(value, ['id']))
    ?? getString(getPath(value, ['tool_id']))
    ?? getString(getPath(value, ['tool_use_id']))
    ?? getString(getPath(value, ['toolUseId']))
    ?? getString(getPath(value, ['callID']))
    ?? getString(getPath(value, ['call_id']))
    ?? getString(getPath(value, ['part', 'id']))
    ?? getString(getPath(value, ['part', 'callID']))
    ?? getString(getPath(value, ['part', 'call_id']));
}

function compactPath(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length <= 2) {
    return segments.join('/') || normalized;
  }
  return segments.slice(-2).join('/');
}

function firstPreview(value: unknown, path: string[], pathLike = false): string | undefined {
  const raw = getPath(value, path);
  const text = getString(raw);
  if (!text) {
    return undefined;
  }
  return preview(pathLike ? compactPath(text) : text, MAX_TOOL_SUMMARY_LENGTH);
}

export function toolSummaryFrom(value: unknown): string | undefined {
  return firstPreview(value, ['input', 'command'])
    ?? firstPreview(value, ['parameters', 'command'])
    ?? firstPreview(value, ['args', 'command'])
    ?? firstPreview(value, ['arguments', 'command'])
    ?? firstPreview(value, ['part', 'state', 'input', 'command'])
    ?? firstPreview(value, ['input', 'file_path'], true)
    ?? firstPreview(value, ['input', 'filePath'], true)
    ?? firstPreview(value, ['input', 'path'], true)
    ?? firstPreview(value, ['parameters', 'file_path'], true)
    ?? firstPreview(value, ['parameters', 'filePath'], true)
    ?? firstPreview(value, ['parameters', 'dir_path'], true)
    ?? firstPreview(value, ['parameters', 'path'], true)
    ?? firstPreview(value, ['args', 'file_path'], true)
    ?? firstPreview(value, ['args', 'filePath'], true)
    ?? firstPreview(value, ['args', 'path'], true)
    ?? firstPreview(value, ['arguments', 'file_path'], true)
    ?? firstPreview(value, ['arguments', 'filePath'], true)
    ?? firstPreview(value, ['arguments', 'path'], true)
    ?? firstPreview(value, ['part', 'state', 'input', 'filePath'], true)
    ?? firstPreview(value, ['part', 'state', 'input', 'file_path'], true)
    ?? firstPreview(value, ['part', 'state', 'input', 'path'], true)
    ?? firstPreview(value, ['input', 'description'])
    ?? firstPreview(value, ['parameters', 'title'])
    ?? firstPreview(value, ['input', 'title'])
    ?? firstPreview(value, ['part', 'state', 'title'])
    ?? firstPreview(value, ['title'])
    ?? firstPreview(value, ['query'])
    ?? firstPreview(value, ['input', 'query'])
    ?? firstPreview(value, ['parameters', 'query']);
}

export function toolInfoFrom(value: unknown): ToolProgressInfo {
  return {
    id: toolIdFrom(value),
    name: toolNameFrom(value),
    summary: toolSummaryFrom(value),
  };
}

export function formatToolLabel(info: ToolProgressInfo | undefined, fallback = 'a tool'): string {
  const name = info?.name;
  const summary = info?.summary;
  if (name && summary) {
    return `${name}: ${summary}`;
  }
  return name ?? summary ?? fallback;
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
