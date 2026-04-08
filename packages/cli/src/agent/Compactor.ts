// packages/cli/src/agent/Compactor.ts
import { generateText } from "ai";
import { v4 as uuidv4 } from "uuid";

/**
 * Compactor: Inspired by Claude Code's autoCompact.ts
 * Summarizes conversation history to prevent token limit crashes.
 */
export class Compactor {
  constructor(private model: any) {}

  async summarize(messages: any[]): Promise<string> {
    if (messages.length < 10) return "";

    const conversationToSummarize = messages
      .map(m => `${m.role.toUpperCase()}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
      .join("\n\n");

    const prompt = `
Summarize this coding/desktop assistant conversation.
Extract and PRESERVE these critical facts:
1. Original goal and sub-goals
2. Completed steps
3. File paths, config values, variable names discovered
4. DESKTOP SPECIFIC — if present:
   - Last known screen resolution (original_width × original_height)
   - Last screenshot path
   - Last confirmed click position
   - Current state of UI (which app, which window, which step)
5. What remains to be done

Format desktop state as:
SCREEN: <width>×<height>
LAST_CLICK: (<x>, <y>) on "<element_name>"
APP_STATE: <current app and window title>

Keep it surgical. No filler.
`;

    const result = await generateText({
      model: this.model,
      system: "You are a surgical conversation summarizer.",
      messages: [
        { role: "user", content: prompt + "\n\nCONVERSATION:\n" + conversationToSummarize }
      ]
    });

    return result.text || "Summary failed.";
  }

  /**
   * Prunes messages by replacing older ones with a summary.
   */
  async prune(messages: any[]): Promise<any[]> {
    const MAX_MESSAGES = 60; // Increased from 30 to match Agent context limits
    if (messages.length <= MAX_MESSAGES) return messages;

    const messagesToPrune = messages.slice(0, messages.length - 10);
    const messagesToKeep = messages.slice(messages.length - 10);

    const summary = await this.summarize(messagesToPrune);
    
    return [
      { 
        id: uuidv4(), 
        role: "system", 
        content: `## CONVERSATION SUMMARY (Auto-Compacted)\nHistorical context for continuity:\n${summary}` 
      },
      ...messagesToKeep
    ];
  }
}
