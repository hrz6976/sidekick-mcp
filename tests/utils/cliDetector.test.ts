import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

import { commandExists, detectAvailableClis } from '../../src/utils/cliDetector.js';
import { getRunnerAdapters } from '../../src/runners/registry.js';

function createMockChild() {
  const handlers: Record<string, Function> = {};
  const child = {
    on: vi.fn((event: string, handler: Function) => {
      handlers[event] = handler;
      return child;
    }),
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
  };
  return {
    child,
    emitClose(code: number) { handlers['close']?.(code); },
    emitError(err: Error) { handlers['error']?.(err); },
  };
}

describe('cliDetector', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.QA_NO_CLIS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('commandExists', () => {
    it('returns true when which exits with code 0', async () => {
      const mock = createMockChild();
      vi.mocked(spawn).mockReturnValue(mock.child as any);

      const promise = commandExists('gemini');
      mock.emitClose(0);

      expect(await promise).toBe(true);
    });

    it('returns false when which exits with non-zero code', async () => {
      const mock = createMockChild();
      vi.mocked(spawn).mockReturnValue(mock.child as any);

      const promise = commandExists('notfound');
      mock.emitClose(1);

      expect(await promise).toBe(false);
    });

    it('returns false when spawn errors', async () => {
      const mock = createMockChild();
      vi.mocked(spawn).mockReturnValue(mock.child as any);

      const promise = commandExists('broken');
      mock.emitError(new Error('ENOENT'));

      expect(await promise).toBe(false);
    });
  });

  describe('detectAvailableClis', () => {
    it('returns all false when QA_NO_CLIS=true', async () => {
      process.env.QA_NO_CLIS = 'true';

      const result = await detectAvailableClis(getRunnerAdapters());
      expect(result).toEqual({ gemini: false, codex: false, claude: false, opencode: false });
      // spawn should not be called at all
      expect(spawn).not.toHaveBeenCalled();
    });

    it('checks runner default commands and returns correct availability', async () => {
      // Mock spawn to return different results for each CLI
      const mocks: ReturnType<typeof createMockChild>[] = [];
      vi.mocked(spawn).mockImplementation(() => {
        const mock = createMockChild();
        mocks.push(mock);
        return mock.child as any;
      });

      const promise = detectAvailableClis(getRunnerAdapters());

      // Wait for all spawns to be called
      await vi.waitFor(() => expect(mocks.length).toBe(4));

      // claude found, gemini not found, codex found, opencode not found
      mocks[0].emitClose(0); // claude
      mocks[1].emitClose(1); // gemini
      mocks[2].emitClose(0); // codex
      mocks[3].emitClose(1); // opencode

      const result = await promise;
      expect(result).toEqual({ claude: true, gemini: false, codex: true, opencode: false });
      expect(vi.mocked(spawn).mock.calls.map((call) => call[1]?.[0])).toEqual([
        'claude',
        'gemini',
        'codex',
        'opencode',
      ]);
    });
  });
});
