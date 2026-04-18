import chalk from "chalk";

export class ProactiveEngine {
  private agent: any;
  private eventQueue: any[] = [];

  constructor(agent: any) {
    this.agent = agent;
  }

  public onEvent(type: string, data: any) {
    this.eventQueue.push({ type, data, timestamp: Date.now() });
    this.processEvents();
  }

  private async processEvents() {
    if (this.eventQueue.length === 0) return;
    
    // Group events within 5 seconds
    const now = Date.now();
    const batch = this.eventQueue.filter(e => now - e.timestamp < 5000);
    if (batch.length < this.eventQueue.length) return; // Wait for quiet period

    this.eventQueue = [];
    
    console.log(chalk.cyan(`[Proactive] Analyzing ${batch.length} system events...`));
    
    const eventSummary = batch.map(e => `${e.type}: ${JSON.stringify(e.data)}`).join("\n");
    const prompt = `System Events Detected:\n${eventSummary}\n\nShould I take any proactive action? If yes, explain why and proposed action. If no, respond with 'SKIP'.`;

    const decision = await this.agent.chat(prompt, {
      systemOverride: "You are a proactive system guardian. Respond with 'SKIP' or an action plan."
    });

    if (decision !== "SKIP") {
      console.log(chalk.bold.hex("#CC785C")(`[Proactive] Taking action: ${decision.slice(0, 100)}...`));
      await this.agent.executePlan(decision);
    }
  }
}
