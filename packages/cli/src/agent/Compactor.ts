// packages/cli/src/agent/Compactor.ts
import { generateText } from "ai";
import { v4 as uuidv4 } from "uuid";

export interface CompactionStrategy {
  readonly maxMessages: number;
  readonly tailSize: number;
  readonly retainUserMessages: boolean;
  readonly summarizationThreshold: number;
}

const DEFAULT_STRATEGY: CompactionStrategy = {
  maxMessages: 40,
  tailSize: 8,
  retainUserMessages: true,
  summarizationThreshold: 12, // Higher threshold = prefer cheap fallback over LLM call
};

/**
 * Compactor: Intelligent message compaction with priority-based retention.
 *
 * Strategy:
 * 1. Always keep the tail (most recent messages)
 * 2. Always keep user messages from the head (they're short and contain intent)
 * 3. Summarize dropped assistant/tool messages into a context block
 * 4. Extract critical facts (file paths, decisions, errors) before dropping
 */
export class Compactor {
  private strategy: CompactionStrategy;

  constructor(private model: any, strategy?: Partial<CompactionStrategy>) {
    this.strategy = { ...DEFAULT_STRATEGY, ...strategy };
  }

  /**
   * Summarize a block of messages into a concise context block.
   */
  async summarize(messages: any[]): Promise<string> {
    if (messages.length < this.strategy.summarizationThreshold) return "";

    const conversationToSummarize = messages
      .map(m => `${m.role.toUpperCase()}: ${typeof m.content === 'string' ? m.content.slice(0, 2000) : JSON.stringify(m.content).slice(0, 2000)}`)
      .join("\n\n");

    const prompt = `
Summarize this coding/desktop assistant conversation into a surgical context block.

CRITICAL: Extract and PRESERVE these facts:
1. Original user goal and sub-goals
2. Completed steps (with file paths and outcomes)
3. Important file paths, config values, variable names, API keys
4. Errors encountered and how they were resolved
5. Key decisions made (why approach A was chosen over B)
6. DESKTOP SPECIFIC (if present):
   - Last known screen resolution (original_width × original_height)
   - Last screenshot path
   - Current state of UI (which app, which window)
7. What remains to be done (pending steps)

FORMAT:
GOAL: [one-line goal]
COMPLETED: [bullet list of done steps]
FILES: [paths created/modified]
DECISIONS: [key choices made]
PENDING: [remaining work]
DESKTOP_STATE: [if applicable]

Keep it under 300 words. No filler.`;

    // Tambahkan timeout 20 detik untuk summary agar tidak hang selamanya
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort(new Error("Compactor summary timeout after 20s"));
    }, 20_000);

    try {
      const result = await generateText({
        model: this.model,
        system: "You are a surgical conversation summarizer. Extract facts, not opinions.",
        messages: [
          { role: "user", content: prompt + "\n\nCONVERSATION:\n" + conversationToSummarize }
        ],
        abortSignal: controller.signal,
        maxOutputTokens: 300, // Reduced from 600 for token savings
      });
      clearTimeout(timeout);
      return result.text || "Summary failed.";
    } catch (e: any) {
      clearTimeout(timeout);
      // Fallback: extract critical facts without LLM
      return this.extractCriticalFactsFallback(messages);
    }
  }

  /**
   * Compacts messages by replacing older ones with a summary.
   * Interface for Agent.ts
   */
  async compact(messages: any[]): Promise<any[]> {
    return this.prune(messages);
  }

  /**
   * Prunes messages by replacing older ones with a summary.
   * Uses priority-based retention to keep user messages.
   */
  async prune(messages: any[]): Promise<any[]> {
    const isOverMessageLimit = messages.length > this.strategy.maxMessages;
    
    // Check if any single message is MASSIVE (e.g. > 50k chars)
    const hasHugeMessage = messages.some(m => typeof m.content === "string" && m.content.length > 50000);
    
    if (!isOverMessageLimit && !hasHugeMessage) return messages;

    // If we have a huge message but few total messages, we must still shrink them
    if (hasHugeMessage && messages.length < 5) {
        return messages.map(m => {
            if (typeof m.content === "string" && m.content.length > 30000) {
                return { ...m, content: m.content.slice(0, 30000) + "\n...[Content truncated due to extreme size]" };
            }
            return m;
        });
    }

    const tail = messages.slice(-this.strategy.tailSize);
    const head = messages.slice(0, -this.strategy.tailSize);

    // Priority: retain user messages from the head (they contain intent)
    const userMessages = this.strategy.retainUserMessages
      ? head.filter(m => m.role === "user")
      : [];

    const toSummarize = head.filter(m => m.role !== "user" || !this.strategy.retainUserMessages);

    if (toSummarize.length < this.strategy.summarizationThreshold) {
      // Not worth summarizing — just keep user messages + tail
      return [...userMessages, ...tail];
    }

    const summary = await this.summarize(toSummarize);

    const summaryMessage = {
      id: uuidv4(),
      role: "system",
      content: `## CONVERSATION SUMMARY (Auto-Compacted)\nHistorical context for continuity:\n${summary}`
    };

    return [summaryMessage, ...userMessages.slice(-5), ...tail];
  }

  /**
   * Fallback: extract critical facts without using the LLM.
   * Used when the summarization call fails (e.g., rate limited).
   */
  private extractCriticalFactsFallback(messages: any[]): string {
    const facts: string[] = [];
    const files = new Set<string>();
    const errors: string[] = [];

    for (const msg of messages) {
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content || "");

      // Extract file paths
      const pathMatches = content.matchAll(/["']([^"']*\.[a-zA-Z]{1,5})["']/g);
      for (const m of pathMatches) {
        if (m[1] && m[1].length < 200) files.add(m[1]);
      }

      // Extract user instructions (first 100 chars of user messages)
      if (msg.role === "user" && content.length > 5) {
        facts.push(`USER: ${content.slice(0, 100)}`);
      }

      // Extract errors
      if (content.toLowerCase().includes("error") && msg.role !== "user") {
        const errorLine = content.split("\n").find((l: string) => l.toLowerCase().includes("error"));
        if (errorLine) errors.push(errorLine.trim().slice(0, 100));
      }
    }

    const lines = [
      "CRITICAL FACTS (extracted without LLM):",
      "",
      "FILES INVOLVED:",
      ...Array.from(files).slice(0, 20).map(f => `  - ${f}`),
      "",
      "USER REQUESTS:",
      ...facts.slice(0, 10).map(f => `  - ${f}`),
    ];

    if (errors.length > 0) {
      lines.push("", "ERRORS SEEN:", ...errors.slice(0, 5).map(e => `  - ${e}`));
    }

    return lines.join("\n");
  }
}
