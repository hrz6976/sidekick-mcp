import { z } from 'zod';

import type { AgentConfig, SidekickConfig } from '../config.js';
import type { ToolExecutionContext } from '../execution.js';
import { formatSetupPrompt, getSetupState, listSidekickAgents, runSidekickAgent, cleanupSidekickWorktree } from '../core/index.js';
import type { CliAvailability } from '../utils/cliDetector.js';
import type { UnifiedTool } from './registry.js';

const ModeSchema = z.enum(['read-only', 'edit', 'full-access']);
const WorktreeSchema = z.enum(['auto', 'off']);
const TrajectorySchema = z.union([
  z.boolean(),
  z.string().trim().min(1),
]).optional().describe('Debug-only ATIF trajectory export. Use true to write trajectory.json in the Sidekick task directory, or provide a path to write a trajectory JSON file.');
const AskTaskSchema = z.object({
  prompt: z.string().min(1),
  mode: ModeSchema.optional(),
  worktree: WorktreeSchema.optional(),
  effort: z.string().trim().min(1).optional(),
  trajectory: TrajectorySchema,
});
const CleanupSchema = z.object({
  taskId: z.string().min(1).optional(),
  worktreeId: z.string().min(1).optional(),
  force: z.boolean().optional(),
});

function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function askToolName(agentName: string): string {
  return `ask_${agentName}`;
}

function askToolDescription(agentName: string, agentConfig: AgentConfig): string {
  const target = agentConfig.model
    ? `${agentName} (${agentConfig.runner}, ${agentConfig.model})`
    : `${agentName} (${agentConfig.runner}, CLI default model)`;
  const custom = agentConfig.description ? `${agentConfig.description} ` : '';
  return [
    `${custom}Start a task-based helper-agent run with ${target}.`,
    'It runs in the MCP client project root when roots are available, or the MCP server launch directory otherwise.',
    'Use mode "read-only" for analysis; read-only calls default to worktree "off".',
    'For edit or full-access work, prefer worktree "auto" to avoid concurrent edits in the main checkout.',
    'Use effort to override this agent\'s configured reasoning effort for one call where the runner supports it.',
    'Optional trajectory is experimental debug-only output: true writes trajectory.json in the Sidekick task directory; a string writes that path.',
  ].join(' ');
}

function askPromptDescription(agentName: string): string {
  return [
    `Ask the configured ${agentName} helper agent to work on a task.`,
    'Sidekick uses the MCP client project root when roots are available, or the MCP server launch directory otherwise.',
    'Use read-only mode for investigation and review; it does not create a worktree unless worktree is explicitly set.',
    'Use edit/full-access mode with worktree auto for implementation work so concurrent helper edits stay isolated.',
    'Use the effort argument to override the configured reasoning effort for this one call where supported.',
    'Use trajectory only for debugging exported ATIF traces; it is not needed for normal asks.',
  ].join(' ');
}

function createAskTool(
  config: SidekickConfig,
  agentName: string,
  agentConfig: AgentConfig,
): UnifiedTool {
  return {
    name: askToolName(agentName),
    description: askToolDescription(agentName, agentConfig),
    zodSchema: AskTaskSchema,
    category: agentConfig.runner,
    execution: { taskSupport: 'optional' },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    prompt: {
      description: askPromptDescription(agentName),
    },
    async execute(args, context?: ToolExecutionContext) {
      const parsed = AskTaskSchema.parse(args);
      const response = await runSidekickAgent(config, {
        agentName,
        prompt: parsed.prompt,
        mode: parsed.mode,
        worktree: parsed.worktree,
        effort: parsed.effort,
        trajectory: parsed.trajectory,
      }, context);
      return jsonText(response);
    },
  };
}

export function createSidekickTools(
  config: SidekickConfig,
  availability: CliAvailability,
): UnifiedTool[] {
  const setupTool: UnifiedTool = {
    name: 'setup',
    description: config.userConfig
      ? 'Review or update Sidekick configuration. Returns an executable prompt that should ask the user to choose helper-agent settings before editing config.'
      : 'Sidekick is not configured yet. Call this tool first to generate an interactive setup prompt for creating Sidekick helper-agent configuration.',
    zodSchema: z.object({}),
    category: 'utility',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    prompt: {
      description: 'Configure or update Sidekick agents. Each configured agent becomes an ask_<name> tool.',
    },
    async execute(_args, context?: ToolExecutionContext) {
      return formatSetupPrompt(await getSetupState(config, availability, context));
    },
  };

  const askTools = config.userConfig ? Object.entries(config.userConfig.agents)
    .filter(([, agentConfig]) => agentConfig.enabled)
    .map(([agentName, agentConfig]) => createAskTool(
      config,
      agentName,
      agentConfig,
    )) : [];

  const listAgentsTool: UnifiedTool = {
    name: 'list_agents',
    description: config.userConfig
      ? 'List configured Sidekick helper agents, their runners, installation status, defaults, and configured models.'
      : 'Sidekick is not configured yet. Call setup first; this tool reports the missing configuration state.',
    zodSchema: z.object({}),
    category: 'utility',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async execute(_args, context?: ToolExecutionContext) {
      return jsonText(await listSidekickAgents(config, availability, context));
    },
  };

  const cleanupTool: UnifiedTool = {
    name: 'cleanup_worktree',
    description: 'Remove a Sidekick-managed worktree recorded in task metadata. This never deletes arbitrary paths.',
    zodSchema: CleanupSchema,
    category: 'utility',
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    async execute(args, context?: ToolExecutionContext) {
      const parsed = CleanupSchema.parse(args);
      return cleanupSidekickWorktree(config, {
        taskId: parsed.taskId,
        worktreeId: parsed.worktreeId,
        force: parsed.force,
      }, context);
    },
  };

  return [setupTool, ...askTools, listAgentsTool, cleanupTool];
}
