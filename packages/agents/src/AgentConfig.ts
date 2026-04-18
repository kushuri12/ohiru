import { z } from "zod";

export const CronTaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  schedule: z.string(),
  type: z.enum(["prompt", "shell", "webhook", "memory_distill", "health_check", "git_summary", "news_briefing"]),
  config: z.record(z.any()).default({}),
  enabled: z.boolean().default(true),
});

export const AgentConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  soul: z.string(), // path to SOUL.md
  workspace: z.string(), // path to workspace root
  model: z.string().optional(),
  channels: z.array(z.object({
    type: z.string(),
    chatId: z.string().optional(),
    guildId: z.string().optional(),
    channelId: z.string().optional(),
  })).default([]),
  skills: z.array(z.string()).default([]),
  memory: z.object({
    namespace: z.string(),
  }),
  cron: z.object({
    heartbeatInterval: z.string().default("30m"),
    tasks: z.array(CronTaskSchema).default([]),
  }).default({ tasks: [] }),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type CronTask = z.infer<typeof CronTaskSchema>;
