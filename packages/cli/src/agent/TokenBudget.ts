import chalk from "chalk";

export interface TokenBudgetResult {
  estimated: number;
  limit: number;
  available: number;
  utilizationPct: number;
  action: "ok" | "warn" | "compress" | "hard_limit";
}

// Model context window limits (keep updated)
const MODEL_LIMITS: Record<string, number> = {
  "gpt-4o": 128_000,
  "gpt-4o-mini": 128_000,
  "gpt-4-turbo": 128_000,
  "claude-3-5-sonnet": 200_000,
  "claude-3-5-haiku": 200_000,
  "claude-3-opus": 200_000,
  "gemini-2.0-flash": 1_000_000,
  "gemini-2.0-pro": 2_000_000,
  "minimax": 196_608,
  "deepseek-chat": 64_000,
  "deepseek-reasoner": 64_000,
  "qwen": 128_000,
  "llama-3": 128_000,
  "mistral-large": 128_000,
  "default": 128_000, 
};

/**
 * TokenBudget
 * Fast token estimation and budget enforcement before API calls.
 */
export class TokenBudget {
  private model: string;

  constructor(model: string) {
    this.model = model;
  }

  /**
   * Fast approximation: 4 chars ≈ 1 token (accurate within ±15%)
   */
  estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimate tokens for a list of messages.
   */
  estimateMessages(messages: any[]): number {
    let total = 0;
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        total += this.estimateTokens(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === "text") total += this.estimateTokens(part.text);
        }
      }
      // Add small constant for message structure
      total += 4;
    }
    return total;
  }

  /**
   * Estimate tokens for tool definitions.
   */
  estimateToolDefs(tools: any[] | Record<string, any>): number {
    const raw = JSON.stringify(tools);
    return this.estimateTokens(raw);
  }

  /**
   * Returns budget assessment and recommended action.
   */
  check(systemPrompt: string, tools: any, messages: any[]): TokenBudgetResult {
    const sysTokens = this.estimateTokens(systemPrompt);
    const toolTokens = this.estimateToolDefs(tools);
    const msgTokens = this.estimateMessages(messages);
    
    const estimated = sysTokens + toolTokens + msgTokens;
    const limit = this.getModelLimit();
    const utilizationPct = (estimated / limit) * 100;
    
    let action: TokenBudgetResult["action"] = "ok";
    if (utilizationPct >= 90) action = "hard_limit";
    else if (utilizationPct >= 80) action = "compress";
    else if (utilizationPct >= 60) action = "warn";

    return {
      estimated,
      limit,
      available: Math.max(0, limit - estimated),
      utilizationPct,
      action
    };
  }

  /**
   * Get the context limit for the current model.
   */
  getModelLimit(): number {
    for (const [key, limit] of Object.entries(MODEL_LIMITS)) {
      if (this.model.includes(key)) return limit;
    }
    return MODEL_LIMITS.default;
  }

  /**
   * Format budget as a short status string for Telegram/CLI output.
   */
  formatStatus(result: TokenBudgetResult): string {
    const usage = `${Math.floor(result.utilizationPct)}% (${Math.round(result.estimated / 1000)}K/${Math.round(result.limit / 1000)}K)`;
    
    if (result.action === "hard_limit") {
      return `🛑 ${chalk.red.bold("CRITICAL Context:")} ${usage} — Aggressive truncation required!`;
    }
    if (result.action === "compress") {
      return `⚠️ ${chalk.yellow.bold("Context Full:")} ${usage} — Compressing history...`;
    }
    if (result.action === "warn") {
      return `📊 ${chalk.yellow("Context Usage:")} ${usage}`;
    }
    return `📊 ${chalk.gray("Context:")} ${usage}`;
  }
}
