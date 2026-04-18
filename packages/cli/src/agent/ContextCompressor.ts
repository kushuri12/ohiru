import chalk from "chalk";

export class ContextCompressor {
  private agent: any;

  constructor(agent: any) {
    this.agent = agent;
  }

  public async compress(messages: any[], targetTokens: number): Promise<any[]> {
    console.log(chalk.gray(`[Context] Compressing history to ${targetTokens} tokens...`));
    
    // Strategy 1: Summarize older conversations
    if (messages.length > 20) {
      const olderMessages = messages.slice(0, -10);
      const recentMessages = messages.slice(-10);
      
      const summary = await this.summarize(olderMessages);
      
      return [
        { role: "system", content: `PREVIOUS CONVERSATION SUMMARY: ${summary}` },
        ...recentMessages
      ];
    }

    return messages; // Fallback: no compression needed
  }

  private async summarize(messages: any[]): Promise<string> {
    const text = messages.map(m => `${m.role}: ${m.content}`).join("\n");
    const prompt = `Summarize this conversation concisely while retaining all key facts, project paths, and decisions made.
    
    CONVERSATION:
    ${text}`;

    return await this.agent.chat(prompt, { 
      systemOverride: "You are a context compression engine. Be extremely dense and factual." 
    });
  }
}
