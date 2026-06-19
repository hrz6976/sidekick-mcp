import type { RunnerName } from '../config.js';
import { antigravityRunner } from './antigravity.js';
import { claudeRunner } from './claude.js';
import { codexRunner } from './codex.js';
import { geminiRunner } from './gemini.js';
import { openCodeRunner } from './opencode.js';
import type { AgentRunner } from './types.js';

const BUILT_IN_RUNNERS = [
  claudeRunner,
  geminiRunner,
  antigravityRunner,
  codexRunner,
  openCodeRunner,
];

const RUNNERS = Object.fromEntries(
  BUILT_IN_RUNNERS.map((runner) => [runner.name, runner]),
) as unknown as Record<RunnerName, AgentRunner>;

export function getRunner(agent: RunnerName): AgentRunner {
  return RUNNERS[agent];
}

export function getRunnerAdapters(): AgentRunner[] {
  return [...BUILT_IN_RUNNERS];
}
