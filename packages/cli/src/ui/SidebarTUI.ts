import chalk from "chalk";
import readline from "readline";
import { c } from "./theme.js";

export interface LogEntry {
  timestamp: Date;
  level: "info" | "warn" | "error" | "success";
  message: string;
  source?: string;
}

const ASCII_HEADER = [
  " ██╗    ██╗███████╗██╗      ██████╗ ███╗   ██╗██╗██████╗ ",
  " ██║    ██║██╔════╝██║     ██╔═══██╗████╗  ██║██║██╔══██╗",
  " ██║ █╗ ██║█████╗   ██║     ██║   ██║██╔██╗ ██║██║██║  ██║",
  " ██║███╗██║██╔══╝   ██║     ██║   ██║██║╚██╗██║██║██║  ██║",
  " ╚███╔███╔╝███████╗███████╗╚██████╔╝██║ ╚████║██║██████╔╝",
  "  ╚══╝ ╚═╝ ╚══════╝╚══════╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝╚═════╝ ",
];

const HEARTBEAT_ASCII = [
  "  ╭──╮  ",
  "  │♥│  ",
  "  ╰──╯  ",
];

export class SidebarTUI {
  private logs: LogEntry[] = [];
  private width: number;
  private sidebarWidth: number = 28;
  private rl: readline.Interface;
  private isRunning: boolean = false;
  private startTime = Date.now();
  private errorCount = 0;
  private provider = "";
  private model = "";
  private skillsCount = 0;
  private heartbeatActive = true;

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
    if (level === "error") this.errorCount++;
    this.render();
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

  public clear(): void {
    this.logs = [];
    this.render();
  }

  public setProvider(p: string) { this.provider = p; this.render(); }
  public setModel(m: string) { this.model = m; this.render(); }
  public setSkillsCount(n: number) { this.skillsCount = n; this.render(); }
  public setHeartbeatActive(active: boolean) { this.heartbeatActive = active; this.render(); }

  private getLevelColor(level: LogEntry["level"]): (s: string) => string {
    switch (level) {
      case "info": return c.muted;
      case "warn": return chalk.yellow;
      case "error": return c.red;
      case "success": return c.green;
    }
  }

  private getLevelIcon(level: LogEntry["level"]): string {
    switch (level) {
      case "info": return "›";
      case "warn": return "warn";
      case "error": return "fail";
      case "success": return "ok";
    }
  }

  private render(): void {
    const mainWidth = Math.max(40, this.width - this.sidebarWidth - 3);
    const availableLines = process.stdout.rows || 24;

    console.clear();
    
    this.renderHeader(mainWidth);
    this.renderMainContent(mainWidth, availableLines);
    this.renderSidebar();
  }

  private renderHeader(width: number): void {
    const hw = Math.min(width, 70);
    const left = Math.floor((hw - ASCII_HEADER[0].length) / 2);
    const right = hw - ASCII_HEADER[0].length - left;
    
    console.log(c.dark("╭" + "─".repeat(hw + 1) + "╮"));
    for (const line of ASCII_HEADER) {
      const padL = " ".repeat(left);
      const padR = " ".repeat(Math.max(0, hw - line.length - left));
      console.log(c.dark("│ ") + c.primary(line) + padR + c.dark(" │"));
    }
    console.log(c.dark("╰" + "─".repeat(hw + 1) + "╯"));
    console.log("");
  }

  private renderMainContent(width: number, maxLines: number): void {
    const shownLogs = this.logs.slice(-(maxLines - 12));
    
    for (const entry of shownLogs) {
      const time = entry.timestamp.toLocaleTimeString("en-US", { hour12: false }).slice(0, 8);
      const levelIcon = this.getLevelIcon(entry.level);
      const color = this.getLevelColor(entry.level);
      const source = entry.source ? c.dark(`[${entry.source}]`) : "";
      
      const prefix = `${c.dark(time)} ${color(levelIcon)}`;
      const line = `${prefix} ${source} ${entry.message}`;
      const truncated = line.substring(0, width - 3);
      
      console.log(` ${truncated}`);
    }

    const emptyLines = Math.max(0, maxLines - shownLogs.length - 14);
    for (let i = 0; i < emptyLines; i++) {
      console.log(" ");
    }
  }

  private renderSidebar(): void {
    const height = Math.max(18, process.stdout.rows || 24);
    
    console.log(c.dark("┌" + "─".repeat(this.sidebarWidth) + "┐"));
    console.log(c.dark("│") + c.light(" SYSTEM ").padStart(this.sidebarWidth) + c.dark("│"));
    console.log(c.dark("├" + "─".repeat(this.sidebarWidth) + "┤"));
    
    const statusLines = [
      { label: "Status", value: this.heartbeatActive ? c.glow("●") : c.muted("○"), valueStr: this.heartbeatActive ? "Active" : "Inactive" },
      { label: "Uptime", value: this.getUptime(), valueStr: this.getUptime() },
      { label: "Memory", value: this.getMemory(), valueStr: this.getMemory() },
    ];

    for (const stat of statusLines) {
      const line = ` ${c.muted(stat.label)}: ${stat.value}`;
      console.log(c.dark("│") + line.padEnd(this.sidebarWidth) + c.dark("│"));
    }

    console.log(c.dark("├" + "─".repeat(this.sidebarWidth) + "┤"));
    console.log(c.dark("│") + c.light(" CONFIG ").padStart(this.sidebarWidth) + c.dark("│"));
    console.log(c.dark("├" + "─".repeat(this.sidebarWidth) + "┤"));
    
    const configLines = [
      { label: "Provider", value: this.provider || "-" },
      { label: "Model", value: (this.model || "-").slice(0, 12) },
      { label: "Skills", value: String(this.skillsCount) },
    ];

    for (const cfg of configLines) {
      const line = ` ${c.muted(cfg.label)}: ${c.light(cfg.value)}`;
      console.log(c.dark("│") + line.padEnd(this.sidebarWidth) + c.dark("│"));
    }

    console.log(c.dark("├" + "─".repeat(this.sidebarWidth) + "┤"));
    
    const logCount = this.logs.length;
    const errCount = this.errorCount;
    const line = ` Logs: ${logCount}${errCount > 0 ? c.muted(` (${errCount} err)`) : ""}`;
    console.log(c.dark("│") + line.padEnd(this.sidebarWidth) + c.dark("│"));

    const remaining = Math.max(0, height - 19);
    for (let i = 0; i < remaining; i++) {
      console.log(c.dark("│") + " ".repeat(this.sidebarWidth) + c.dark("│"));
    }
    
    console.log(c.dark("└" + "─".repeat(this.sidebarWidth) + "┘"));
  }

  private getUptime(): string {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;
    if (hours > 0) return `${hours}h${ String(minutes).padStart(2, "0") }m`;
    if (minutes > 0) return `${ String(minutes).padStart(2, "0") }m${ String(seconds).padStart(2, "0") }s`;
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
  }
}