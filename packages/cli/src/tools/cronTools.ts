import { z } from "zod";
import chalk from "chalk";

export function createCronTools(cronManager: any) {
  return {
    cron_list: {
      description: "List all scheduled tasks with their next run times and status.",
      parameters: z.object({}),
      execute: async () => {
        const tasks = cronManager.listTasks();
        if (tasks.length === 0) return "No scheduled tasks.";
        return tasks.map((t: any) => 
          `- ${t.name} (${t.id}): ${t.schedule} [Last Run: ${t.lastRun || "Never"}]`
        ).join("\n");
      }
    },

    cron_add: {
      description: "Create a new scheduled task.",
      parameters: z.object({
        id: z.string(),
        name: z.string(),
        schedule: z.string(),
        type: z.enum(["prompt", "shell", "webhook", "memory_distill"]),
        config: z.record(z.any()),
      }),
      execute: async (args: any) => {
        cronManager.addTask(args);
        return `Task "${args.name}" created.`;
      }
    },

    cron_remove: {
      description: "Remove a scheduled task.",
      parameters: z.object({
        id: z.string(),
      }),
      execute: async (args: any) => {
        cronManager.removeTask(args.id);
        return `Task ${args.id} removed.`;
      }
    }
  };
}
