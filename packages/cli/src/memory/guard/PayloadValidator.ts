/**
 * Simple token estimator to predict context usage before API calls.
 * 1 token ≈ 4 characters (conservative for high-entropy code).
 */
export class PayloadValidator {
  private CHARS_PER_TOKEN = 3.5;

  constructor(
    private maxTokens: number = 200_000,
    private warnPercent: number = 75,
    private compressPercent: number = 90
  ) {}

  /**
   * Evaluates messages and determines if the context is safe to send.
   */
  validate(messages: any[], systemPrompt: string): {
    isValid: boolean;
    estimatedTokens: number;
    usagePercent: number;
    warnings: string[];
    action: "none" | "warn" | "compress" | "critical";
  } {
    const totalChars = this.countTotalChars(messages, systemPrompt);
    const estimatedTokens = Math.ceil(totalChars / this.CHARS_PER_TOKEN);
    const usagePercent = Math.round((estimatedTokens / this.maxTokens) * 100);

    const warnings: string[] = [];
    let action: "none" | "warn" | "compress" | "critical" = "none";

    // 1. Critical Overflow (API will reject)
    if (usagePercent >= 95) {
      action = "critical";
      warnings.push(`Context is at ${usagePercent}% — CRITICAL! API will reject.`);
    } 
    // 2. High Pressure (Needs compression)
    else if (usagePercent >= this.compressPercent) {
      action = "compress";
      warnings.push(`Context is tight (${usagePercent}%). Compression required.`);
    } 
    // 3. Warning (Heads up to user)
    else if (usagePercent >= this.warnPercent) {
      action = "warn";
      warnings.push(`Warning: Context is ${usagePercent}% full.`);
    }

    // Individual message size warning
    const hugeBlocks = this.findHugeMessages(messages);
    if (hugeBlocks.length > 0) {
      warnings.push(`${hugeBlocks.length} messages are unusually large (>10K chars).`);
    }

    return {
      isValid: usagePercent < 100,
      estimatedTokens,
      usagePercent,
      warnings,
      action
    };
  }

  private countTotalChars(messages: any[], systemPrompt: string): number {
    let total = systemPrompt.length;
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        total += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "text") total += block.text?.length || 0;
          if (block.type === "tool_use") total += JSON.stringify(block.input).length;
          if (block.type === "tool_result") {
            const content = block.content;
            if (typeof content === "string") total += content.length;
            else if (Array.isArray(content)) {
              total += content.reduce((sum: number, c: any) => sum + (c.text?.length || 0), 0);
            }
          }
        }
      }
    }
    return total;
  }

  private findHugeMessages(messages: any[]) {
    return messages.filter(m => this.countTotalChars([m], "") > 15_000);
  }
}
