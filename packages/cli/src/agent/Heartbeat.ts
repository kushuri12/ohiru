import { HiruAgent } from "./Agent.js";
import { ProjectContext } from "shared";
import chalk from "chalk";
import { EventEmitter } from "events";
import { c } from "../ui/theme.js";

export interface HeartbeatConfig {
  intervalMs: number;
  enabled: boolean;
}

export class HeartbeatManager extends EventEmitter {
  private agent: HiruAgent;
  private ctx: ProjectContext;
  private config: HeartbeatConfig;
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(agent: HiruAgent, ctx: ProjectContext, config: HeartbeatConfig) {
    super();
    this.agent = agent;
    this.ctx = ctx;
    this.config = config;
  }

  public start() {
    if (!this.config.enabled) return;
    if (this.timer) return;

    console.log(`  ${c.glow("💓")}  ${c.muted("Heartbeat       ")}${chalk.white(`Active (${this.config.intervalMs / 1000 / 60}m intervals)`)}`);
    
    this.timer = setInterval(() => {
      this.pulse();
    }, this.config.intervalMs);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async pulse() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      this.emit("pulse", { timestamp: new Date() });
      
      // Proactively check for issues or tasks
      // We don't want to spam the LLM, so we might check local triggers first
      // For now, let's keep it simple: the agent can be told to "check status" during pulse
      
      // Example: Autonomously check for TODOs or critical errors
      // await this.agent.runStreaming("Check if there are any urgent tasks or project issues I should address right now. If none, just say 'System Healthy'.", this.ctx);
      
    } catch (e) {
      console.error(`  ${c.red("✗")}  ${c.muted("Heartbeat       ")}${c.red(`Error: ${e}`)}`);
    } finally {
      this.isRunning = false;
    }
  }
}
