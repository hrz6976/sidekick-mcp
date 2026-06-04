export const PROTOCOL = {
  NOTIFICATIONS: {
    PROGRESS: 'notifications/progress',
  },
} as const;

export const CLI = {
  COMMANDS: {
    GEMINI: 'gemini',
    CODEX: 'codex',
    CLAUDE: 'claude',
    OPENCODE: 'opencode',
  },
} as const;

export type ToolArguments = Record<string, unknown>;
