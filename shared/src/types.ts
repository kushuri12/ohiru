export type ProviderCapability =
  | "streaming"
  | "tool_use"
  | "vision"
  | "long_context"
  | "reasoning"
  | "fast"
  | "local"
  | "free";

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

export interface HiruConfig {
  provider: string;
  model: string;
  apiKey?: string;
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
