import type { RunnerName } from '../config.js';

export interface CliProgressRenderer {
  onChunk(chunk: string): string[];
  flush(): string[];
}

type JsonObject = Record<string, unknown>;

const MAX_PROGRESS_MESSAGE_LENGTH = 180;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function preview(value: unknown, maxLength = MAX_PROGRESS_MESSAGE_LENGTH): string | undefined {
  const raw = typeof value === 'string' ? value : value === undefined ? undefined : JSON.stringify(value);
  const normalized = raw?.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
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

function formatTokenStats(stats: unknown): string | undefined {
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

function lastMeaningfulLine(value: unknown, maxLength = 120): string | undefined {
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

function toolNameFrom(value: unknown): string | undefined {
  return getString(getPath(value, ['name']))
    ?? getString(getPath(value, ['tool']))
    ?? getString(getPath(value, ['tool_name']))
    ?? getString(getPath(value, ['function', 'name']))
    ?? getString(getPath(value, ['input', 'name']));
}

function renderClaudeEvent(event: JsonObject): string[] {
  const type = getString(event.type);
  if (type === 'system') {
    const subtype = getString(event.subtype);
    if (subtype === 'init') {
      const model = getString(event.model);
      return [`Claude started${model ? ` (${model})` : ''}`];
    }
    if (subtype === 'api_retry') {
      const attempt = event.attempt;
      const maxRetries = event.max_retries;
      const delay = event.retry_delay_ms;
      const error = getString(event.error);
      const attemptText = typeof attempt === 'number' && typeof maxRetries === 'number'
        ? ` ${attempt}/${maxRetries}`
        : '';
      const delayText = typeof delay === 'number' ? ` in ${Math.round(delay / 1000)}s` : '';
      return [`Claude retrying API request${attemptText}${delayText}${error ? ` (${error})` : ''}`];
    }
    if (subtype === 'plugin_install') {
      const status = getString(event.status);
      const name = getString(event.name);
      return [`Claude plugin install ${status ?? 'updated'}${name ? `: ${name}` : ''}`];
    }
    if (subtype === 'status') {
      const status = preview(getPath(event, ['status', 'description']) ?? getPath(event, ['status', 'text']) ?? event.status);
      return status ? [`Claude status: ${status}`] : [];
    }
    if (subtype === 'hook_progress') {
      const name = getString(event.hook_name);
      const output = preview(event.output ?? event.stderr ?? event.stdout);
      return output ? [`Claude hook${name ? ` ${name}` : ''}: ${output}`] : [];
    }
    if (subtype === 'hook_response') {
      const outcome = getString(event.outcome);
      if (outcome && outcome !== 'success') {
        const name = getString(event.hook_name);
        const output = preview(event.stderr ?? event.output ?? event.stdout);
        return [`Claude hook ${outcome}${name ? `: ${name}` : ''}${output ? ` (${output})` : ''}`];
      }
      return [];
    }
  }

  if (type === 'streamlined_text') {
    const text = preview(event.text);
    return text ? [`Claude: ${text}`] : [];
  }

  if (type === 'streamlined_tool_use_summary') {
    const summary = preview(event.tool_summary);
    return summary ? [`Claude tools: ${summary}`] : [];
  }

  if (type === 'tool_progress') {
    const name = getString(event.tool_name);
    const elapsed = event.elapsed_time_seconds;
    const elapsedText = typeof elapsed === 'number' ? ` for ${Math.round(elapsed)}s` : '';
    return [`Claude ${name ?? 'tool'} still running${elapsedText}`];
  }

  if (type === 'assistant') {
    const content = event.content ?? getPath(event, ['message', 'content']);
    if (Array.isArray(content)) {
      return content.flatMap((part) => {
        if (!isObject(part)) {
          return [];
        }
        const partType = getString(part.type);
        if (partType === 'text') {
          const text = preview(part.text);
          return text ? [`Claude: ${text}`] : [];
        }
        if (partType === 'tool_use' || partType === 'server_tool_use') {
          return [`Claude using ${toolNameFrom(part) ?? 'a tool'}`];
        }
        return [];
      });
    }
    const text = preview(content);
    return text ? [`Claude: ${text}`] : [];
  }

  if (type === 'user') {
    const content = getPath(event, ['message', 'content']);
    if (Array.isArray(content)) {
      return content.flatMap((part) => {
        if (!isObject(part) || part.type !== 'tool_result') {
          return [];
        }
        const failed = part.is_error === true || getPath(event, ['tool_use_result', 'is_error']) === true;
        const stderr = preview(getPath(event, ['tool_use_result', 'stderr']));
        return [`Claude tool ${failed ? 'failed' : 'completed'}${stderr ? `: ${stderr}` : ''}`];
      });
    }
  }

  if (type === 'tool_use') {
    return [`Claude using ${toolNameFrom(event) ?? 'a tool'}`];
  }

  if (type === 'tool_result') {
    const name = toolNameFrom(event);
    return [`Claude received${name ? ` ${name}` : ' tool'} result`];
  }

  if (type === 'stream_event') {
    const deltaType = getString(getPath(event, ['event', 'delta', 'type']));
    if (deltaType === 'text_delta') {
      const text = preview(getPath(event, ['event', 'delta', 'text']));
      return text ? [`Claude: ${text}`] : [];
    }
    const blockType = getString(getPath(event, ['event', 'content_block', 'type']));
    if (blockType === 'tool_use') {
      return [`Claude using ${toolNameFrom(getPath(event, ['event', 'content_block'])) ?? 'a tool'}`];
    }
  }

  if (type === 'result') {
    const failed = event.is_error === true || event.subtype === 'error';
    const text = preview(event.result);
    return [`Claude ${failed ? 'failed' : 'completed'}${text ? `: ${text}` : ''}`];
  }

  return [];
}

function renderGeminiEvent(event: JsonObject): string[] {
  const type = getString(event.type);
  if (type === 'init') {
    const model = getString(event.model);
    return [`Gemini started${model ? ` (${model})` : ''}`];
  }
  if (type === 'message') {
    if (event.role === 'user') {
      return [];
    }
    const text = preview(event.content);
    return text ? [`Gemini: ${text}`] : [];
  }
  if (type === 'tool_use') {
    return [`Gemini using ${toolNameFrom(event) ?? 'a tool'}`];
  }
  if (type === 'tool_result') {
    const name = toolNameFrom(event);
    return [`Gemini received${name ? ` ${name}` : ' tool'} result`];
  }
  if (type === 'error') {
    const message = preview(event.message ?? event.error);
    return [`Gemini warning${message ? `: ${message}` : ''}`];
  }
  if (type === 'result') {
    const status = getString(event.status);
    const stats = formatTokenStats(event.stats);
    const error = preview(getPath(event, ['error', 'message']) ?? event.error);
    if (status === 'error') {
      return [`Gemini failed${error ? `: ${error}` : ''}`];
    }
    return [`Gemini completed${stats ? ` (${stats})` : ''}`];
  }
  return [];
}

function codexItemLabel(item: JsonObject, eventType: string): string[] {
  const itemType = getString(item.type);
  if (itemType === 'agent_message') {
    const text = preview(item.text);
    return text ? [`Codex: ${text}`] : [];
  }
  if (itemType === 'reasoning') {
    return ['Codex is reasoning...'];
  }
  if (itemType === 'command_execution') {
    const command = preview(item.command, 120);
    const status = getString(item.status);
    const lastOutput = lastMeaningfulLine(item.aggregated_output);
    if (eventType === 'item.updated' && lastOutput) {
      return [`Codex command output: ${lastOutput}`];
    }
    if (eventType === 'item.completed') {
      const exitCode = item.exit_code;
      return [`Codex command ${status === 'failed' ? 'failed' : 'completed'}${typeof exitCode === 'number' ? ` (${exitCode})` : ''}${command ? `: ${command}` : ''}`];
    }
    return [`Codex running command${command ? `: ${command}` : ''}`];
  }
  if (itemType === 'file_change') {
    const changes = Array.isArray(item.changes) ? item.changes : [];
    const paths = changes
      .map((change) => preview(getPath(change, ['path']), 40))
      .filter((path): path is string => Boolean(path));
    return [`Codex changed ${changes.length} file${changes.length === 1 ? '' : 's'}${paths.length ? `: ${paths.slice(0, 3).join(', ')}` : ''}`];
  }
  if (itemType === 'mcp_tool_call') {
    const server = getString(item.server);
    const tool = getString(item.tool);
    const status = getString(item.status);
    const name = [server, tool].filter(Boolean).join('.');
    return [`Codex ${eventType === 'item.completed' ? status === 'failed' ? 'failed MCP tool' : 'completed MCP tool' : 'calling MCP tool'}${name ? ` ${name}` : ''}`];
  }
  if (itemType === 'web_search') {
    const query = preview(item.query, 120);
    return [`Codex web search${query ? `: ${query}` : ''}`];
  }
  if (itemType === 'todo_list') {
    const items = Array.isArray(item.items) ? item.items : [];
    const completed = items.filter((todo) => getPath(todo, ['completed']) === true).length;
    const next = items.find((todo) => isObject(todo) && todo.completed !== true);
    const nextText = preview(getPath(next, ['text']), 80);
    return [`Codex updated todo list (${completed}/${items.length} complete)${nextText ? `; next: ${nextText}` : ''}`];
  }
  if (itemType === 'error') {
    const message = preview(item.message);
    return [`Codex error${message ? `: ${message}` : ''}`];
  }
  return [];
}

function renderCodexEvent(event: JsonObject): string[] {
  const type = getString(event.type);
  if (type === 'thread.started') {
    return ['Codex thread started'];
  }
  if (type === 'turn.started') {
    return ['Codex turn started'];
  }
  if (type === 'turn.completed') {
    const usage = formatTokenStats(event.usage);
    return [`Codex completed${usage ? ` (${usage})` : ''}`];
  }
  if (type === 'turn.failed' || type === 'error') {
    const message = preview(getPath(event, ['error', 'message']) ?? event.message);
    return [`Codex failed${message ? `: ${message}` : ''}`];
  }
  if ((type === 'item.started' || type === 'item.updated' || type === 'item.completed') && isObject(event.item)) {
    return codexItemLabel(event.item, type);
  }

  const msg = event.msg;
  if (isObject(msg)) {
    const msgType = getString(msg.type);
    if (msgType === 'text') {
      const text = preview(msg.content);
      return text ? [`Codex: ${text}`] : [];
    }
    if (msgType === 'exec_approval_request') {
      const command = preview(msg.command ?? msg.content, 120);
      return [`Codex requested command approval${command ? `: ${command}` : ''}`];
    }
    if (msgType === 'apply_patch_approval_request') {
      return ['Codex requested patch approval'];
    }
    if (msgType === 'turn_complete') {
      return ['Codex completed'];
    }
    if (msgType === 'error') {
      const message = preview(msg.message ?? msg.content);
      return [`Codex error${message ? `: ${message}` : ''}`];
    }
  }

  const method = getString(event.method);
  if (method === 'item/agentMessage/delta') {
    const text = preview(getPath(event, ['params', 'delta']));
    return text ? [`Codex: ${text}`] : [];
  }
  if (method?.includes('turn') && method.endsWith('/started')) {
    return ['Codex turn started'];
  }
  if (method?.includes('turn') && method.endsWith('/completed')) {
    return ['Codex completed'];
  }
  return [];
}

function renderOpenCodeEvent(event: JsonObject): string[] {
  const type = getString(event.type);
  const part = isObject(event.part) ? event.part : undefined;
  if (type === 'step_start') {
    return ['OpenCode step started'];
  }
  if (type === 'step_finish') {
    const reason = getString(part?.reason);
    const tokens = formatTokenStats(part?.tokens);
    if (reason === 'stop') {
      return [`OpenCode step completed${tokens ? ` (${tokens})` : ''}`];
    }
    if (reason === 'tool-calls') {
      return ['OpenCode step finished; tool calls completed'];
    }
    return ['OpenCode step finished'];
  }
  if (type === 'text') {
    const text = preview(part?.text ?? event.text);
    return text ? [`OpenCode: ${text}`] : [];
  }
  if (type === 'reasoning') {
    return ['OpenCode is reasoning...'];
  }
  if (type === 'tool_use') {
    const tool = getString(part?.tool) ?? toolNameFrom(part) ?? toolNameFrom(event);
    const status = getString(getPath(part, ['state', 'status']));
    const title = preview(getPath(part, ['state', 'title']), 80);
    const exitCode = getPath(part, ['state', 'metadata', 'exit']);
    const lastOutput = lastMeaningfulLine(getPath(part, ['state', 'output']) ?? getPath(part, ['state', 'metadata', 'output']));
    if (status === 'error') {
      const error = preview(getPath(part, ['state', 'error']));
      return [`OpenCode tool failed${tool ? `: ${tool}` : ''}${error ? `: ${error}` : ''}`];
    }
    return [`OpenCode tool completed${tool ? `: ${tool}` : ''}${title ? ` (${title})` : ''}${typeof exitCode === 'number' ? ` exit ${exitCode}` : ''}${lastOutput ? `: ${lastOutput}` : ''}`];
  }
  if (type === 'error') {
    const message = preview(
      getPath(event, ['error', 'data', 'message'])
        ?? getPath(event, ['error', 'message'])
        ?? getPath(event, ['error', 'name'])
        ?? event.error,
    );
    return [`OpenCode error${message ? `: ${message}` : ''}`];
  }
  return [];
}

function renderJsonEvent(runner: RunnerName, event: JsonObject): string[] {
  switch (runner) {
    case 'claude':
      return renderClaudeEvent(event);
    case 'gemini':
      return renderGeminiEvent(event);
    case 'codex':
      return renderCodexEvent(event);
    case 'opencode':
      return renderOpenCodeEvent(event);
  }
}

export function createCliProgressRenderer(runner: RunnerName): CliProgressRenderer {
  let buffer = '';

  const renderLine = (line: string): string[] => {
    const trimmed = line.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isObject(parsed)) {
        return renderJsonEvent(runner, parsed);
      }
    } catch {
      // Fall through to raw line preview for non-JSON output.
    }

    const rawPreview = preview(trimmed);
    return rawPreview ? [`${runner}: ${rawPreview}`] : [];
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
