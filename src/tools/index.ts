// Tool Registry Index - registers the Sidekick public tool surface.
import type { SidekickConfig } from '../config.js';
import type { Logger } from '../logger.js';
import { getRunnerAdapters } from '../runners/registry.js';
import { detectAvailableClis, type CliAvailability } from '../utils/cliDetector.js';
import { toolRegistry } from './registry.js';
import { createSidekickTools } from './sidekick.js';

export async function initTools(
  config: Pick<SidekickConfig, 'cliDetectTimeoutMs'> & {
    logger?: Logger;
    sidekickConfig: SidekickConfig;
  },
): Promise<CliAvailability> {
  toolRegistry.length = 0;
  const availability = await detectAvailableClis(
    getRunnerAdapters(),
    config.cliDetectTimeoutMs,
    config.logger,
  );

  toolRegistry.push(...createSidekickTools(config.sidekickConfig, availability));

  config.logger?.info('sidekick_tool_registry_initialized', {
    setupRequired: config.sidekickConfig.setupRequired,
    availability,
    toolNames: toolRegistry.map((tool) => tool.name),
  });

  return availability;
}

export * from './registry.js';
