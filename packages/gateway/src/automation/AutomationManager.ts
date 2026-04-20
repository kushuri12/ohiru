import { z } from "zod";
import { EventEmitter } from "events";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import os from "os";
import chalk from "chalk";

export const CronJobSchema = z.object({
  id: z.string(),
  name: z.string(),
  schedule: z.string(),
  agentId: z.string(),
  command: z.string(),
  enabled: z.boolean().default(true),
  lastRun: z.number().optional(),
  nextRun: z.number().optional(),
});

export type CronJob = z.infer<typeof CronJobSchema>;

export const WebhookSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("POST"),
  headers: z.record(z.string()).default({}),
  body: z.string().optional(),
  agentId: z.string(),
  event: z.string(),
  enabled: z.boolean().default(true),
});

export type Webhook = z.infer<typeof WebhookSchema>;

export class CronScheduler extends EventEmitter {
  private jobs: Map<string, CronJob> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private dataDir: string;

  constructor(dataDir?: string) {
    super();
    this.dataDir = dataDir || path.join(os.homedir(), ".hiru", "automation");
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    mkdirSync(this.dataDir, { recursive: true });
  }

  public addJob(job: CronJob): void {
    this.jobs.set(job.id, job);
    if (job.enabled) {
      this.scheduleJob(job);
    }
    this.saveJobs();
    console.log(chalk.green(`[Cron] Scheduled job: ${job.name}`));
  }

  public removeJob(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(id);
    }
    this.jobs.delete(id);
    this.saveJobs();
  }

  private scheduleJob(job: CronJob): void {
    const interval = this.parseSchedule(job.schedule);
    if (!interval) {
      console.error(chalk.red(`[Cron] Invalid schedule: ${job.schedule}`));
      return;
    }

    const timer = setInterval(async () => {
      await this.runJob(job);
    }, interval);

    this.timers.set(job.id, timer);
  }

  private parseSchedule(schedule: string): number | null {
    const patterns: Record<string, number> = {
      "@every-minute": 60 * 1000,
      "@every-5-minutes": 5 * 60 * 1000,
      "@every-15-minutes": 15 * 60 * 1000,
      "@every-30-minutes": 30 * 60 * 1000,
      "@hourly": 60 * 60 * 1000,
      "@daily": 24 * 60 * 60 * 1000,
      "@weekly": 7 * 24 * 60 * 60 * 1000,
    };
    
    if (patterns[schedule]) {
      return patterns[schedule];
    }
    
    const minuteMatch = schedule.match(/@every (\d+) minutes/);
    if (minuteMatch) {
      return parseInt(minuteMatch[1]) * 60 * 1000;
    }
    
    return 60 * 1000;
  }

  private async runJob(job: CronJob): Promise<void> {
    console.log(chalk.cyan(`[Cron] Running job: ${job.name}`));
    job.lastRun = Date.now();
    this.emit("run", job);
    this.saveJobs();
  }

  public listJobs(): CronJob[] {
    return Array.from(this.jobs.values());
  }

  private saveJobs(): void {
    const jobsPath = path.join(this.dataDir, "cron.json");
    writeFileSync(jobsPath, JSON.stringify(Array.from(this.jobs.values()), null, 2));
  }
}

export class WebhookServer extends EventEmitter {
  private webhooks: Map<string, Webhook> = new Map();
  private server: ReturnType<typeof createServer> | null = null;
  private port: number;
  private eventHandlers: Map<string, (data: any) => Promise<void>> = new Map();

  constructor(port: number = 18792) {
    super();
    this.port = port;
  }

  public async start(): Promise<void> {
    this.server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = req.url || "";
      
      if (url.startsWith("/webhook/")) {
        await this.handleWebhook(req, res);
      } else if (url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    this.server.listen(this.port, () => {
      console.log(chalk.green(`[Webhook] Server listening on port ${this.port}`));
    });
  }

  private async handleWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }

    let data: any;
    try {
      data = JSON.parse(body);
    } catch {
      data = body;
    }

    const webhookId = req.url?.split("/")[2];
    const webhook = this.webhooks.get(webhookId || "");

    if (!webhook) {
      res.writeHead(404);
      res.end("Webhook not found");
      return;
    }

    const handler = this.eventHandlers.get(webhook.event);
    if (handler) {
      await handler(data);
    }

    this.emit("webhook", { webhook, data });
    res.writeHead(200);
    res.end("OK");
  }

  public registerWebhook(webhook: Webhook): void {
    this.webhooks.set(webhook.id, webhook);
    console.log(chalk.green(`[Webhook] Registered: ${webhook.name}`));
  }

  public removeWebhook(id: string): void {
    this.webhooks.delete(id);
  }

  public onEvent(event: string, handler: (data: any) => Promise<void>): void {
    this.eventHandlers.set(event, handler);
  }

  public listWebhooks(): Webhook[] {
    return Array.from(this.webhooks.values());
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server?.close(() => resolve());
    });
  }
}

export class AutomationManager extends EventEmitter {
  private cron: CronScheduler;
  private webhooks: WebhookServer;

  constructor() {
    super();
    this.cron = new CronScheduler();
    this.webhooks = new WebhookServer();
  }

  public async start(): Promise<void> {
    await this.webhooks.start();
  }

  public async stop(): Promise<void> {
    await this.webhooks.stop();
  }

  public getCron(): CronScheduler {
    return this.cron;
  }

  public getWebhooks(): WebhookServer {
    return this.webhooks;
  }

  public addCronJob(job: CronJob): void {
    this.cron.addJob(job);
  }

  public removeCronJob(id: string): void {
    this.cron.removeJob(id);
  }

  public registerWebhook(webhook: Webhook): void {
    this.webhooks.registerWebhook(webhook);
  }

  public removeWebhook(id: string): void {
    this.webhooks.removeWebhook(id);
  }
}