import { spawn } from "child_process";
import type { RunnerName } from "../config.js";
import type { Logger } from "../logger.js";
import type { AgentRunner } from "../runners/types.js";

const isWindows = process.platform === "win32";

/**
 * Check if a command exists on the system PATH.
 * Uses `which` on Unix/macOS, `where` on Windows.
 * Always resolves to a boolean — never rejects.
 */
export async function commandExists(
  command: string,
  timeoutMs?: number,
  logger?: Logger,
): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const checker = isWindows ? "where" : "which";
      logger?.debug('cli_probe_started', {
        command,
        checker,
        timeoutMs,
      });
      const child = spawn(checker, [command], {
        stdio: ["ignore", "ignore", "ignore"],
        shell: isWindows,
      });
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };

      if (timeoutMs && timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          child.kill('SIGTERM');
          logger?.error('cli_probe_timed_out', {
            command,
            checker,
            timeoutMs,
          });
          resolve(false);
        }, timeoutMs);
      }

      child.on("error", (error) => {
        cleanup();
        logger?.error('cli_probe_spawn_failed', {
          command,
          checker,
          error,
        });
        resolve(false);
      });

      child.on("close", (code) => {
        cleanup();
        logger?.debug('cli_probe_finished', {
          command,
          checker,
          exitCode: code,
          exists: code === 0,
        });
        resolve(code === 0);
      });
    } catch (error) {
      logger?.error('cli_probe_threw', {
        command,
        error,
      });
      resolve(false);
    }
  });
}

type CliProbe = Pick<AgentRunner, 'name' | 'defaultCommand'>;

export type CliAvailability = Record<RunnerName, boolean>;

function unavailable(runners: readonly CliProbe[]): CliAvailability {
  return Object.fromEntries(
    runners.map((runner) => [runner.name, false]),
  ) as CliAvailability;
}

/**
 * Detect which supported runner CLIs are available on the system.
 * Runs checks in parallel for speed.
 */
export async function detectAvailableClis(
  runners: readonly CliProbe[],
  timeoutMs?: number,
  logger?: Logger,
): Promise<CliAvailability> {
  if (process.env.QA_NO_CLIS === 'true') {
    logger?.info('cli_detection_skipped', {
      reason: 'QA_NO_CLIS=true',
    });
    return unavailable(runners);
  }

  logger?.info('cli_detection_started', {
    runners: runners.map((runner) => runner.name),
    timeoutMs,
  });
  const entries = await Promise.all(runners.map(async (runner) => [
    runner.name,
    await commandExists(runner.defaultCommand, timeoutMs, logger),
  ] as const));

  const availability = Object.fromEntries(entries) as CliAvailability;
  logger?.info('cli_detection_finished', { availability });

  return availability;
}
