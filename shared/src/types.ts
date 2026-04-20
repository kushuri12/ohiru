export type ProviderCapability =
  | "streaming"
  | "tool_use"
  | "vision"
  | "long_context"
  | "reasoning"
  | "fast"
  | "local"
  | "free"
  | "coding";

export interface ModelDef {
  id: string;
  label: string;
  contextWindow: number;
  maxOutput: number;
  inputPricePerM: number;
  outputPricePerM: number;
  capabilities: ProviderCapability[];
  recommended?: boolean;
  note?: string;
}

export interface ProviderDef {
  id: string;
  label: string;
  description: string;
  icon: string;
  apiKeyEnv: string;
  apiKeyLabel: string;
  apiKeyUrl: string;
  baseUrl?: string;
  models: ModelDef[];
  supportsCustomModel: boolean;
  needsBaseUrl: boolean;
}

export interface ImapConfig {
  user: string;
  password?: string;
  host: string;
  port: number;
  tls: boolean;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface HiruConfig {
  provider: string;
  model: string;
  apiKey?: string;
  apiKeys?: Record<string, string>; // NEW: Store keys for each provider (providerId -> key)
  baseUrl?: string;
  permission: string;
  maxTokens?: number;
  maxIterations?: number;
  temperature?: number;
  theme?: string;
  editor?: string;
  shell?: string;
  excludePatterns?: string[];
  alwaysAllowTools?: string[];
  alwaysAskTools?: string[];
  customInstructions?: string;
  mcpServers?: string[];
  autoCommit?: boolean;
  showCostWarning?: boolean;
  costWarnThreshold?: number;
  maxMemoryMB?: number;
  thinkingMode?: "compact" | "verbose" | "silent";
  planMode?: boolean;
  autoApproveReadOnly?: boolean;
  planningTimeoutMs?: number;
  executionTimeoutMs?: number;
  telegramBotToken?: string;
  telegramAllowedChatId?: string;

  // --- OPENCLAW LEVEL UPGRADE CONFIG ---
  
  // Gateway
  gatewayPort?: number;           // default: 18790
  gatewayEnabled?: boolean;       // default: false
  gatewayBindHost?: string;       // default: '127.0.0.1'

  // Channels  
  channels?: {
    discord?: { token: string; guildId?: string; channelId?: string };
    slack?: { botToken: string; signingSecret: string; appToken: string };
    whatsapp?: { enabled: boolean; sessionDir?: string };
    signal?: { phoneNumber: string; signalCliPath?: string };
    matrix?: { homeserver: string; userId: string; accessToken: string; room: string };
    irc?: { server: string; port: number; nick: string; channel: string; tls?: boolean };
    webchat?: { port: number; title?: string; theme?: 'light'|'dark' };
    ntfy?: { server?: string; topic: string };
    email?: { imap: ImapConfig; smtp: SmtpConfig };
  };

  // Voice
  voice?: {
    enabled?: boolean;
    ttsProvider?: 'elevenlabs'|'openai'|'google'|'system';
    elevenLabsApiKey?: string;
    elevenLabsVoiceId?: string;
    sttProvider?: 'openai'|'local';
    wakeWord?: string;
    wakeWordEnabled?: boolean;
    ttsVolume?: number;
    ttsSpeechRate?: number;
  };

  // Multi-agent
  multiAgent?: {
    enabled?: boolean;
    defaultAgentId?: string;
    agentsDir?: string;
  };

  // Canvas
  canvas?: {
    enabled?: boolean;
    port?: number;
  };

  // Dashboard
  dashboard?: {
    enabled?: boolean;
    port?: number;
    authToken?: string;
  };

  // Intelligence
  intelligence?: {
    webSearchProvider?: 'brave'|'serper'|'ddg';
    webSearchApiKey?: string;
    enableSelfCritique?: boolean;
    enableProactive?: boolean;
    proactiveEvents?: ('file_change'|'test_fail'|'error_log'|'git_conflict')[];
    modelRoutingEnabled?: boolean;
    dailyBudgetUSD?: number;
  };

  // Cron
  cron?: {
    enabled?: boolean;
    timezone?: string;
  };
}

export interface ProjectContext {
  root: string;
  primaryLanguage: string;
  framework: string;
  packageManager: string;
  testRunner: string;
  linter: string;
  entrypoint: string;
  gitBranch: string;
  recentCommits: string[];
  hiruMDContent: string;
  importantFiles: string[];
}
