import chalk from "chalk";
import readline from "readline";

// UI version – keep in sync with CLI version (currently 1.1.0)
const CLI_VERSION = "1.1.0";

const c = {
  primary: (s: string) => chalk.hex("#3B82F6")(s),
  success: (s: string) => chalk.hex("#22C55E")(s),
  warning: (s: string) => chalk.hex("#F59E0B")(s),
  error: (s: string) => chalk.hex("#EF4444")(s),
  thinking: (s: string) => chalk.hex("#A78BFA")(s), // Purple for thinking
  white: (s: string) => chalk.white(s),
  gray100: (s: string) => chalk.hex("#F3F4F6")(s),
  gray400: (s: string) => chalk.hex("#9CA3AF")(s),
  gray500: (s: string) => chalk.hex("#6B7280")(s),
  gray600: (s: string) => chalk.hex("#4B5563")(s),
  gray700: (s: string) => chalk.hex("#374151")(s),
  gray800: (s: string) => chalk.hex("#1F2937")(s),
};

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

export interface LogEntry {
  timestamp: Date;
  level: "info" | "warn" | "error" | "success" | "debug" | "thinking" | "ai" | "user";
  message: string;
  source?: string;
}

interface MenuItem {
  id: string;
  label: string;
  description: string;
  shortcut: string;
}

const MAIN_MENU: MenuItem[] = [
  { id: "settings", label: "Settings", description: "Configure provider", shortcut: "/settings" },
  { id: "skills", label: "Skills", description: "Manage skills", shortcut: "/skills" },
  { id: "agents", label: "Agents", description: "View agents", shortcut: "/agents" },
  { id: "clear", label: "Clear", description: "Clear console", shortcut: "/clear" },
  { id: "help", label: "Help", description: "Show help", shortcut: "/help" },
  { id: "quit", label: "Quit", description: "Exit app", shortcut: "/quit" },
];

export class OpenCodeTUI {
  private logs: LogEntry[] = [];
  private width = 120;
  private height = 35;
  private isRunning = false;
  private startTime = Date.now();
  private provider = "";
  private model = "";
  private skillsCount = 0;
  private status: "idle" | "active" | "error" = "idle";
  private currentInput = "";
  private showMenu = false;
  private selectedMenuIndex = 0;
  private menuFilter = "";
  private modifiedFiles: { path: string; added: number; removed: number }[] = [];
  
  // New dynamic stats
  private tokensUsed = 0;
  private tokensMax = 500000;
  private usageCost = 0.00;
  private currentTarget = "Main Agent";

  constructor() {
    this.width = process.stdout.columns || 120;
    this.height = process.stdout.rows || 35;
    
    process.stdout.on("resize", () => {
      this.width = process.stdout.columns || 120;
      this.height = process.stdout.rows || 35;
      this.render();
    });
  }

  public log(level: LogEntry["level"], message: string, source?: string): void {
    this.logs.push({ timestamp: new Date(), level, message, source });
    if (this.logs.length > 50) this.logs.shift();
    this.render();
  }

  public info(msg: string, src?: string): void { this.log("info", msg, src); }
  public warn(msg: string, src?: string): void { this.log("warn", msg, src); }
  public error(msg: string, src?: string): void { this.log("error", msg, src); }
  public success(msg: string, src?: string): void { this.log("success", msg, src); }

  public setModifiedFiles(files: { path: string; added: number; removed: number }[]) {
    this.modifiedFiles = files;
    this.render();
  }

  public setProvider(p: string) { this.provider = p; this.render(); }
  public setModel(m: string) { this.model = m; this.render(); }
  public setSkillsCount(n: number) { this.skillsCount = n; this.render(); }
  public setStatus(s: "idle" | "active" | "error") { this.status = s; this.render(); }
  public setTokens(used: number, max?: number) { 
    this.tokensUsed = used; 
    if (max) this.tokensMax = max;
    this.render(); 
  }
  public setCost(cost: number) { this.usageCost = cost; this.render(); }
  public setTarget(target: string) { this.currentTarget = target; this.render(); }

  private getLevelIcon(level: LogEntry["level"]): { icon: string; color: (s: string) => string } {
    switch (level) {
      case "info": return { icon: "▸", color: c.gray400 };
      case "warn": return { icon: "▸", color: c.warning };
      case "error": return { icon: "▸", color: c.error };
      case "success": return { icon: "✓", color: c.success };
      case "debug": return { icon: "◦", color: c.gray500 };
      case "thinking": return { icon: "⚙", color: c.thinking };
      case "ai": return { icon: "●", color: c.primary };
      case "user": return { icon: "❯", color: c.white };
    }
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
  }

  private getUptime(): string {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  private getMemory(): string {
    return `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`;
  }

  private render(): void {
    if (!this.isRunning) return;

    const w = Math.min(this.width, 120);
    const h = this.height;
    const sidebarWidth = 30;
    const mainWidth = w - sidebarWidth - 3; // -3 for borders: │ main │ sidebar │
    const lines: string[] = [];

    // 1. Top border
    lines.push(c.gray800("┌" + "─".repeat(mainWidth + 2) + "┬" + "─".repeat(sidebarWidth + 2) + "┐"));

    // 2. Header Row
    const statusIcon = this.status === "active" ? c.success("●") : c.gray400("○");
    const headerLeftStr = c.gray100(" openhiru") + c.gray500(` v${CLI_VERSION}`);
    const headerRightStr = `${statusIcon} ${c.gray400(this.provider || "...")} · ${this.getUptime()} `;
    const headerPad = " ".repeat(Math.max(0, mainWidth - visibleLength(headerLeftStr) - visibleLength(headerRightStr)));
    lines.push(c.gray800("│") + headerLeftStr + headerPad + headerRightStr + c.gray800("│") + this.sidebarLine(0, sidebarWidth + 2) + c.gray800("│"));

    // 3. Info bar row
    const infoLeft = ` ${this.model || "no model"} · ${this.skillsCount} skills`;
    const infoRight = this.getMemory() + " ";
    const infoPad = " ".repeat(Math.max(0, mainWidth - visibleLength(infoLeft) - visibleLength(infoRight)));
    lines.push(c.gray800("│") + c.gray400(infoLeft) + infoPad + c.gray400(infoRight) + c.gray800("│") + this.sidebarLine(1, sidebarWidth + 2) + c.gray800("│"));

    // 4. Content Area Separator
    lines.push(c.gray800("├" + "─".repeat(mainWidth + 2) + "┼" + "─".repeat(sidebarWidth + 2) + "┤"));

    // 5. Content rows
    const contentRows = h - 9; // Subtracting borders and static rows
    const visibleLogs = this.logs.slice(-contentRows);
    
    for (let i = 0; i < contentRows; i++) {
      const log = visibleLogs[i];
      let mainContent = "";
      
      if (log) {
        if (log.level === "thinking") {
          mainContent = ` ${c.thinking("⚙")} ${c.thinking(log.message)}`;
        } else {
          const { icon, color } = this.getLevelIcon(log.level);
          const time = c.gray600(this.formatTime(log.timestamp));
          const source = log.source ? c.gray700(`[${log.source}]`) : "";
          const msg = color(log.message);
          mainContent = ` ${icon} ${time} ${source} ${msg}`;
        }
      }
      
      const truncated = mainContent.length > 0 ? mainContent.split("\n")[0].slice(0, mainWidth + 50) : "";
      const padding = " ".repeat(Math.max(0, mainWidth + 2 - visibleLength(truncated)));
      
      lines.push(c.gray800("│") + truncated + padding + c.gray800("│") + this.sidebarLine(i + 2, sidebarWidth + 2) + c.gray800("│"));
    }

    // 6. Separator above input
    lines.push(c.gray800("├" + "─".repeat(mainWidth + 2) + "┼" + "─".repeat(sidebarWidth + 2) + "┤"));

    // 7. Input row
    const prompt = this.showMenu ? " /" : " ❯ ";
    const inputText = this.showMenu ? this.menuFilter : this.currentInput;
    const inputContent = c.primary(prompt) + c.white(inputText);
    const cursor = !this.showMenu ? c.primary("█") : "";
    const inputPadLength = Math.max(0, mainWidth + 2 - visibleLength(inputContent) - visibleLength(cursor));
    const inputPad = " ".repeat(inputPadLength);
    lines.push(c.gray800("│") + inputContent + cursor + inputPad + c.gray800("│") + this.sidebarLine(contentRows + 2, sidebarWidth + 2) + c.gray800("│"));

    // 8. Help hint row
    const hint = this.showMenu ? " ↑/↓ select · enter confirm · esc close " : " type / for menu ";
    const hintPad = " ".repeat(Math.max(0, mainWidth + 2 - visibleLength(hint)));
    lines.push(c.gray800("│") + c.gray500(hint) + hintPad + c.gray800("│") + this.sidebarLine(contentRows + 3, sidebarWidth + 2) + c.gray800("│"));

    // 9. Bottom border
    lines.push(c.gray800("└" + "─".repeat(mainWidth + 2) + "┴" + "─".repeat(sidebarWidth + 2) + "┘"));

    // 10. Status bar (outside the main box)
    const usagePercent = Math.round((this.tokensUsed / this.tokensMax) * 100);
    const tokensStr = `${(this.tokensUsed / 1000).toFixed(1)}K (${usagePercent}%)`;
    const bottomBarLeft = ` ${c.primary("●")} Build · ${c.white(this.model || "loading")} · ${this.getUptime()}`;
    const bottomBarRight = `${tokensStr}  ctrl+p commands `;
    const bottomPad = " ".repeat(Math.max(0, w - visibleLength(bottomBarLeft) - visibleLength(bottomBarRight)));
    lines.push(bottomBarLeft + bottomPad + bottomBarRight);

    // Render
    console.clear();
    process.stdout.write(lines.join("\n") + "\n");
  }

  private sidebarLine(row: number, width: number): string {
    const usagePercent = Math.round((this.tokensUsed / this.tokensMax) * 100);
    
    const lines = [
      ` ${c.white(this.currentTarget)}`,
      "",
      ` ${c.white("Context")}`,
      ` ${c.gray400(this.tokensUsed.toLocaleString() + " tokens")}`,
      ` ${c.gray400(usagePercent + "% used")}`,
      ` ${c.gray400("$" + this.usageCost.toFixed(2) + " spent")}`,
      "",
      ` ${c.white("LSP")}`,
      ` ${c.gray500("LSPs will activate as")}`,
      ` ${c.gray500("files are read")}`,
      "",
      ` ${c.primary("▸")} ${c.gray400("Todo")}`,
      "",
      ` ${c.white("Modified Files")}`,
      ...this.modifiedFiles.slice(0, 5).map(f => {
        const path = f.path.split("/").pop() || f.path;
        return ` ${path.slice(0, 15)} ${c.success("+" + f.added)}`;
      }),
    ];
    
    const text = lines[row] || "";
    const contentWidth = width - 1; // Subtract internal padding
    const paddedText = pad(text, contentWidth);
    return " " + paddedText;
  }

  public start(): void {
    this.isRunning = true;
    this.render();
    this.setupInput();
  }

  public stop(): void {
    this.isRunning = false;
  }

  private setupInput(): void {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    process.stdin.on("keypress", (str, key) => {
      if (key.ctrl && key.name === "p") {
        this.showMenu = !this.showMenu;
        this.menuFilter = "";
        this.selectedMenuIndex = 0;
        this.render();
        return;
      }

      if (key.name === "escape") {
        if (this.showMenu) {
          this.showMenu = false;
          this.menuFilter = "";
          this.selectedMenuIndex = 0;
          this.render();
        }
        return;
      }

      if (this.showMenu) {
        if (key.name === "return") {
          const filtered = this.menuFilter 
            ? MAIN_MENU.filter(item => item.label.toLowerCase().includes(this.menuFilter.toLowerCase()))
            : MAIN_MENU;
          const selected = filtered[this.selectedMenuIndex];
          if (selected) {
            this.showMenu = false;
            this.menuFilter = "";
            this.selectedMenuIndex = 0;
            this.handleCommand(selected.shortcut);
          }
          return;
        } else if (key.name === "up") {
          this.selectedMenuIndex = Math.max(0, this.selectedMenuIndex - 1);
          this.render();
          return;
        } else if (key.name === "down") {
          const filtered = this.menuFilter 
            ? MAIN_MENU.filter(item => item.label.toLowerCase().includes(this.menuFilter.toLowerCase()))
            : MAIN_MENU;
          this.selectedMenuIndex = Math.min(filtered.length - 1, this.selectedMenuIndex + 1);
          this.render();
          return;
        } else if (key.name === "backspace") {
          this.menuFilter = this.menuFilter.slice(0, -1);
          this.selectedMenuIndex = 0;
          this.render();
          return;
        } else if (str && str.length === 1) {
          this.menuFilter += str;
          this.selectedMenuIndex = 0;
          this.render();
          return;
        }
        return;
      }

      if (key.name === "return") {
        this.handleCommand(this.currentInput.trim());
        this.currentInput = "";
      } else if (key.name === "backspace") {
        this.currentInput = this.currentInput.slice(0, -1);
      } else if (str === "/" && this.currentInput === "") {
        this.showMenu = true;
        this.menuFilter = "";
        this.selectedMenuIndex = 0;
      } else if (str && str.length === 1) {
        this.currentInput += str;
      }
      this.render();
    });
  }

  private async handleCommand(cmd: string): Promise<void> {
    if (!cmd) return;
    switch (cmd) {
      case "/quit":
        this.info("Shutting down...", "system");
        setTimeout(() => process.exit(0), 500);
        break;
      case "/clear":
        this.logs = [];
        this.success("Cleared", "system");
        break;
      case "/settings":
        await this.showSettingsPopup();
        break;
      case "/skills":
        await this.showSkillsPopup();
        break;
      case "/agents":
        await this.showAgentsPopup();
        break;
      case "/memory":
        await this.showMemoryPopup();
        break;
      case "/help":
        await this.showHelpPopup();
        break;
      default:
        this.info(`Command: ${cmd}`, "system");
    }
  }

  private async showSettingsPopup(): Promise<void> {
    const w = Math.min(this.width, 60);
    const lines: string[] = [];
    lines.push(c.gray800("┌" + "─".repeat(w) + "┐"));
    lines.push(c.gray800("│") + pad(c.primary(" SETTINGS "), w) + c.gray800("│"));
    lines.push(c.gray800("├" + "─".repeat(w) + "┤"));
    lines.push(c.gray800("│") + pad(`Provider: ${this.provider || "none"}`, w) + c.gray800("│"));
    lines.push(c.gray800("│") + pad(`Model: ${this.model || "none"}`, w) + c.gray800("│"));
    lines.push(c.gray800("│") + pad(`Skills: ${this.skillsCount}`, w) + c.gray800("│"));
    lines.push(c.gray800("└" + "─".repeat(w) + "┘"));
    console.clear();
    console.log(lines.join("\n"));
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise<void>((resolve) => {
      rl.question(c.gray400("  Press Enter to close"), () => {
        rl.close();
        resolve();
      });
    });
    this.render();
  }

  private async showSkillsPopup(): Promise<void> {
    const w = Math.min(this.width, 55);
    const lines: string[] = [];
    lines.push(c.gray800("┌" + "─".repeat(w) + "┐"));
    lines.push(c.gray800("│") + pad(c.primary(" SKILLS "), w) + c.gray800("│"));
    lines.push(c.gray800("├" + "─".repeat(w) + "┤"));
    lines.push(c.gray800("│") + pad(`Installed: ${this.skillsCount} skills`, w) + c.gray800("│"));
    lines.push(c.gray800("└" + "─".repeat(w) + "┘"));
    console.clear();
    console.log(lines.join("\n"));
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise<void>((resolve) => {
      rl.question(c.gray400("  Press Enter to close"), () => {
        rl.close();
        resolve();
      });
    });
    this.render();
  }

  private async showAgentsPopup(): Promise<void> {
    const w = Math.min(this.width, 55);
    const lines: string[] = [];
    lines.push(c.gray800("┌" + "─".repeat(w) + "┐"));
    lines.push(c.gray800("│") + pad(c.primary(" AGENTS "), w) + c.gray800("│"));
    lines.push(c.gray800("├" + "─".repeat(w) + "┤"));
    lines.push(c.gray800("│") + pad(`Active: main (Telegram bridge)`, w) + c.gray800("│"));
    lines.push(c.gray800("└" + "─".repeat(w) + "┘"));
    console.clear();
    console.log(lines.join("\n"));
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise<void>((resolve) => {
      rl.question(c.gray400("  Press Enter to close"), () => {
        rl.close();
        resolve();
      });
    });
    this.render();
  }

  private async showMemoryPopup(): Promise<void> {
    const w = Math.min(this.width, 55);
    const lines: string[] = [];
    lines.push(c.gray800("┌" + "─".repeat(w) + "┐"));
    lines.push(c.gray800("│") + pad(c.primary(" MEMORY "), w) + c.gray800("│"));
    lines.push(c.gray800("├" + "─".repeat(w) + "┤"));
    lines.push(c.gray800("│") + pad(`Messages: ${this.logs.length}`, w) + c.gray800("│"));
    lines.push(c.gray800("│") + pad(`Memory: ${this.getMemory()}`, w) + c.gray800("│"));
    lines.push(c.gray800("└" + "─".repeat(w) + "┘"));
    console.clear();
    console.log(lines.join("\n"));
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise<void>((resolve) => {
      rl.question(c.gray400("  Press Enter to close"), () => {
        rl.close();
        resolve();
      });
    });
    this.render();
  }

  private async showHelpPopup(): Promise<void> {
    const w = Math.min(this.width, 60);
    const lines: string[] = [];
    lines.push(c.gray800("┌" + "─".repeat(w) + "┐"));
    lines.push(c.gray800("│") + pad(c.primary(" HELP "), w) + c.gray800("│"));
    lines.push(c.gray800("├" + "─".repeat(w) + "┤"));
    const cmds = [
      "/settings – open settings",
      "/skills – manage skills",
      "/agents – view agents",
      "/memory – memory info",
      "/clear – clear console",
      "/quit – exit",
      "type / for menu"
    ];
    for (const line of cmds) {
      lines.push(c.gray800("│") + pad(line, w) + c.gray800("│"));
    }
    lines.push(c.gray800("└" + "─".repeat(w) + "┘"));
    console.clear();
    console.log(lines.join("\n"));
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise<void>((resolve) => {
      rl.question(c.gray400("  Press Enter to close"), () => {
        rl.close();
        resolve();
      });
    });
    this.render();
  }

public clear(): void {
    this.logs = [];
    this.render();
  }
}

export async function showSettingsModal(config: any): Promise<any> {
  console.clear();
  console.log("Settings (press Enter)");
  return { action: "" };
}
