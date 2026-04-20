import chalk from "chalk";
import readline from "readline";
import { c } from "./theme.js";

export interface LogEntry {
  timestamp: Date;
  level: "info" | "warn" | "error" | "success";
  message: string;
  source?: string;
}

/**
 * Utility to calculate visible length of a string (excluding ANSI escape codes)
 */
function visibleLength(str: string): number {
  return str.replace(/\u001b\[[0-9;]*m/g, "").length;
}

/**
 * Utility to pad a string with spaces based on its visible length
 */
function pad(str: string, length: number): string {
  const diff = length - visibleLength(str);
  return diff > 0 ? str + " ".repeat(diff) : str;
}

export class MinimalistTUI {
  private logs: LogEntry[] = [];
  private width: number;
  private rl: readline.Interface;
  private isRunning: boolean = false;
  private startTime = Date.now();
  private provider = "";
  private model = "";
  private skillsCount = 0;
  private status: "idle" | "active" | "error" = "idle";
  private renderTimeout: NodeJS.Timeout | null = null;
  private hasRendered = false;

  constructor() {
    this.width = process.stdout.columns || 80;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  public log(level: LogEntry["level"], message: string, source?: string): void {
    this.logs.push({
      timestamp: new Date(),
      level,
      message,
      source,
    });
    if (level === "error") this.status = "error";
    else if (level === "success") this.status = "active";
    this.scheduleRender();
  }

  public info(message: string, source?: string): void {
    this.log("info", message, source);
  }

  public warn(message: string, source?: string): void {
    this.log("warn", message, source);
  }

  public error(message: string, source?: string): void {
    this.log("error", message, source);
  }

  public success(message: string, source?: string): void {
    this.log("success", message, source);
  }

  public setProvider(p: string) { 
    this.provider = p; 
    this.scheduleRender();
  }
  
  public setModel(m: string) { 
    this.model = m; 
    this.scheduleRender();
  }
  
  public setSkillsCount(n: number) { 
    this.skillsCount = n; 
    this.scheduleRender();
  }
  
  public setStatus(s: "idle" | "active" | "error") { 
    this.status = s; 
    this.scheduleRender();
  }

  private scheduleRender(): void {
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout);
    }
    this.renderTimeout = setTimeout(() => {
      this.render();
    }, 50);
  }

  private getLevelColor(level: LogEntry["level"]): (s: string) => string {
    switch (level) {
      case "info": return c.muted;
      case "warn": return chalk.yellow;
      case "error": return c.red;
      case "success": return c.green;
    }
  }

  private getStatusIcon(): string {
    switch (this.status) {
      case "active": return c.green("●");
      case "error": return c.red("●");
      case "idle": return c.muted("○");
    }
  }

  private render(): void {
    if (!this.isRunning) return;
    
    const availableLines = process.stdout.rows || 24;
    const lines: string[] = [];
    
    // Build header
    lines.push("");
    lines.push(`  ${c.primary("openhiru")} ${c.muted("v1.1.0")}`);
    lines.push("");
    
    // Build status bar
    const statusIcon = this.getStatusIcon();
    const uptime = this.getUptime();
    const memory = this.getMemory();
    const left = `${statusIcon} ${c.light(this.provider || "unknown")}`;
    const right = `${c.muted(uptime)} ${c.muted("|")} ${c.muted(memory)}`;
    const space = Math.max(0, this.width - visibleLength(left) - visibleLength(right) - 4);
    lines.push(`  ${left}${" ".repeat(space)}${right}`);
    const separator = "─".repeat(Math.min(this.width - 4, 76));
    lines.push(`  ${c.dark(separator)}`);
    
    // Build content
    const contentLines = Math.min(availableLines - 8, 20);
    const shownLogs = this.logs.slice(-contentLines);
    
    for (const entry of shownLogs) {
      const time = entry.timestamp.toLocaleTimeString("en-US", { 
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
      const color = this.getLevelColor(entry.level);
      const source = entry.source ? c.dark(`[${entry.source}]`) : "";
      const line = `  ${c.dark(time)} ${source} ${color(entry.message)}`;
      const truncated = line.substring(0, Math.min(this.width - 2, 78));
      lines.push(truncated);
    }

    // Clear and render once
    console.clear();
    console.log(lines.join("\n"));
  }

  private getUptime(): string {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;
    if (hours > 0) return `${hours}h${String(minutes).padStart(2, "0")}m`;
    if (minutes > 0) return `${String(minutes).padStart(2, "0")}m${String(seconds).padStart(2, "0")}s`;
    return `${seconds}s`;
  }

  private getMemory(): string {
    const used = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 10) / 10;
    return `${used}MB`;
  }

  public start(): void {
    this.isRunning = true;
    this.render();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout);
    }
  }

  public clear(): void {
    this.logs = [];
    this.scheduleRender();
  }
}

// Simple modal for settings using readline
export async function showSettingsModal(currentConfig: any): Promise<any> {
  console.clear();
  
  const boxWidth = 50;
  const line = (text: string, width: number) => {
    const padding = Math.max(0, width - text.length);
    return text + " ".repeat(padding);
  };

  console.log("");
  console.log(`  ${c.dark("┌" + "─".repeat(boxWidth) + "┐")}`);
  console.log(`  ${c.dark("│")} ${pad(c.bold(" Settings "), boxWidth)} ${c.dark("│")}`);
  console.log(`  ${c.dark("├" + "─".repeat(boxWidth) + "┤")}`);
  console.log(`  ${c.dark("│")} ${pad("1. Provider: " + (currentConfig.provider || "not set"), boxWidth)} ${c.dark("│")}`);
  console.log(`  ${c.dark("│")} ${pad("2. Model: " + (currentConfig.model || "not set"), boxWidth)} ${c.dark("│")}`);
  console.log(`  ${c.dark("│")} ${pad("3. Telegram Bot: " + (currentConfig.telegramBotToken ? "✓ configured" : "✗ not set"), boxWidth)} ${c.dark("│")}`);
  console.log(`  ${c.dark("│")} ${pad("4. Gateway Port: " + (currentConfig.gatewayPort || "18790"), boxWidth)} ${c.dark("│")}`);
  console.log(`  ${c.dark("│")} ${pad("5. Dashboard Port: " + (currentConfig.dashboard?.port || "3792"), boxWidth)} ${c.dark("│")}`);
  console.log(`  ${c.dark("├" + "─".repeat(boxWidth) + "┤")}`);
  console.log(`  ${c.dark("│")} ${pad(c.muted("Press 1-5 to edit, q to close"), boxWidth)} ${c.dark("│")}`);
  console.log(`  ${c.dark("└" + "─".repeat(boxWidth) + "┘")}`);
  console.log("");

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question("  > ", (answer) => {
      rl.close();
      resolve({ action: answer.trim() });
    });
  });
}
