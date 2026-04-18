import { execa } from "execa";
import { CronTask } from "./CronTask.js";
import chalk from "chalk";

export class TaskRunner {
  private agent: any;

  constructor(agent: any) {
    this.agent = agent;
  }

  public async run(task: CronTask): Promise<void> {
    switch (task.type) {
      case "prompt":
        await this.agent.chat(task.config.prompt);
        break;

      case "shell":
        const { stdout } = await execa(task.config.command, { shell: true });
        console.log(chalk.gray(`[Cron:${task.id}] Output: ${stdout.slice(0, 50)}...`));
        break;

      case "webhook":
        await fetch(task.config.url, {
          method: "POST",
          body: JSON.stringify(task.config.payload),
        });
        break;

      case "memory_distill":
        // Trigger agent memory distillation
        break;

      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }
}
