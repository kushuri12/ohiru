import chalk from "chalk";

export interface ReActStep {
  thought: string;
  action?: string;
  parameters?: any;
  observation?: string;
}

export class ReActEngine {
  private steps: ReActStep[] = [];
  private maxIterations: number;
  private agent: any;

  constructor(agent: any, maxIterations: number = 10) {
    this.agent = agent;
    this.maxIterations = maxIterations;
  }

  public async run(goal: string): Promise<string> {
    console.log(chalk.bold.hex("#CC785C")(`\n 🧠 Starting ReAct Loop for goal: "${goal}"`));
    
    for (let i = 0; i < this.maxIterations; i++) {
      // 1. Reason
      const step = await this.reason(goal);
      this.steps.push(step);
      
      console.log(chalk.hex("#CC785C")(`\n Thought ${i+1}: ${step.thought}`));
      
      if (!step.action) {
        return `Goal reached: ${step.thought}`;
      }

      // 2. Act
      console.log(chalk.cyan(` Action: ${step.action}(${JSON.stringify(step.parameters)})`));
      const observation = await this.agent.callTool(step.action, step.parameters);
      step.observation = observation;
      
      console.log(chalk.gray(` Observation: ${observation.slice(0, 100)}...`));
      
      // 4. Check for loop/failure
      if (observation.includes("Error") && i > 5) {
         return "Failed to achieve goal after multiple attempts.";
      }
    }

    return "Max iterations reached without explicit conclusion.";
  }

  private async reason(goal: string): Promise<ReActStep> {
    const history = this.steps.map(s => 
      `Thought: ${s.thought}\nAction: ${s.action}\nObservation: ${s.observation}`
    ).join("\n\n");

    const prompt = `Goal: ${goal}\n\nHistory:\n${history}\n\nWhat is your next Thought and Action? If done, provide a final Thought only.`;
    
    const response = await this.agent.chat(prompt, { 
      systemOverride: "You are a ReAct reasoner. Format: Thought: [text] Action: [tool_name] Parameters: [json]" 
    });

    // Parse response
    const thought = response.match(/Thought: (.*)/)?.[1] || response;
    const action = response.match(/Action: (.*)/)?.[1];
    let parameters = {};
    try {
      const pStr = response.match(/Parameters: (.*)/)?.[1];
      if (pStr) parameters = JSON.parse(pStr);
    } catch(e) {}

    return { thought, action, parameters };
  }
}
