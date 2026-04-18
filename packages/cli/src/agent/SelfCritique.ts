import chalk from "chalk";

export class SelfCritique {
  private agent: any;

  constructor(agent: any) {
    this.agent = agent;
  }

  public async evaluate(task: string, result: string): Promise<{ score: number; critique: string }> {
    console.log(chalk.gray(`[Intelligence] Critiquing output...`));
    
    const prompt = `Task: ${task}\n\nResult:\n${result}\n\nCritique your own work. Score 1-10 on accuracy, completeness, and safety. List any missed edge cases.`;
    
    const critiqueResponse = await this.agent.chat(prompt, { 
      systemOverride: "You are a harsh but fair technical auditor." 
    });

    const scoreMatch = critiqueResponse.match(/Score: (\d+)/);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 7;

    return { score, critique: critiqueResponse };
  }
}
