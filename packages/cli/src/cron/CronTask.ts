import { z } from "zod";

export const CronTaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  schedule: z.string(), // cron expression
  type: z.enum(["prompt", "shell", "webhook", "memory_distill", "health_check", "git_summary", "news_briefing"]),
  config: z.record(z.any()).default({}),
  enabled: z.boolean().default(true),
  lastRun: z.string().optional(),
  runCount: z.number().default(0),
  failCount: z.number().default(0),
});

export type CronTask = z.infer<typeof CronTaskSchema>;
