import fs from "fs-extra";
import path from "path";
import os from "os";
import chalk from "chalk";
import { CronTask, CronTaskSchema } from "./CronTask.js";
import { CronExpression } from "./CronExpression.js";
import { TaskRunner } from "./TaskRunner.js";

export class CronManager {
  private tasksFile: string;
  private tasks: Map<string, CronTask> = new Map();
  private runner: TaskRunner;
  private timer: NodeJS.Timeout | null = null;

  constructor(agent: any) {
    this.tasksFile = path.join(os.homedir(), ".openhiru", "cron", "tasks.json");
    fs.ensureFileSync(this.tasksFile);
    this.runner = new TaskRunner(agent);
    this.loadTasks();
  }

  private async loadTasks() {
    try {
      const data = await fs.readJson(this.tasksFile);
      if (Array.isArray(data)) {
        data.forEach(t => {
          const validated = CronTaskSchema.parse(t);
          this.tasks.set(validated.id, validated);
        });
      }
    } catch (e) {
      this.tasks = new Map();
    }
  }

  public async saveTasks() {
    await fs.writeJson(this.tasksFile, Array.from(this.tasks.values()), { spaces: 2 });
  }

  public addTask(task: CronTask) {
    const validated = CronTaskSchema.parse(task);
    this.tasks.set(validated.id, validated);
    this.saveTasks();
  }

  public removeTask(id: string) {
    this.tasks.delete(id);
    this.saveTasks();
  }

  public start() {
    console.log(chalk.cyan(`[Cron] Scheduler started.`));
    this.timer = setInterval(() => this.tick(), 60000); // Pulse every minute
  }

  public stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    const now = new Date();
    for (const task of this.tasks.values()) {
      if (!task.enabled) continue;
      
      const lastRun = task.lastRun ? new Date(task.lastRun) : null;
      if (CronExpression.shouldRun(task.schedule, now, lastRun)) {
        console.log(chalk.hex("#CC785C")(`[Cron] Running task: ${task.name} (${task.id})`));
        try {
          await this.runner.run(task);
          task.lastRun = now.toISOString();
          task.runCount++;
        } catch (err) {
          task.failCount++;
        }
        this.saveTasks();
      }
    }
  }

  public listTasks() {
    return Array.from(this.tasks.values());
  }
}
