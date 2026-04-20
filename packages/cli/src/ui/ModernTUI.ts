import chalk from "chalk";
import readline from "readline";

// Color palette - monochrome base with orange accents
const palette = {
  orange: "#FF6B35",      // Primary accent
  orangeLight: "#FF8C61", // Light orange
  orangeDark: "#CC5500",  // Dark orange
  white: "#FFFFFF",
  gray: {
    50: "#F9FAFB",
    100: "#F3F4F6",
    200: "#E5E7EB",
    300: "#D1D5DB",
    400: "#9CA3AF",
    500: "#6B7280",
    600: "#4B5563",
    700: "#374151",
    800: "#1F2937",
    900: "#111827",
  }
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

const c = {
  orange: (s: string) => chalk.hex(palette.orange)(s),
  orangeLight: (s: string) => chalk.hex(palette.orangeLight)(s),
  orangeDark: (s: string) => chalk.hex(palette.orangeDark)(s),
  white: (s: string) => chalk.white(s),
  whiteDim: (s: string) => chalk.hex(palette.gray[300])(s),
  gray: (s: string) => chalk.hex(palette.gray[500])(s),
  grayLight: (s: string) => chalk.hex(palette.gray[400])(s),
  grayDark: (s: string) => chalk.hex(palette.gray[700])(s),
  black: (s: string) => chalk.black(s),
  bold: (s: string) => chalk.bold(s),
  dim: (s: string) => chalk.dim(s),
  inverse: (s: string) => chalk.inverse(s),
};

export interface LogEntry {
  timestamp: Date;
  level: "info" | "warn" | "error" | "success" | "debug";
  message: string;
  source?: string;
}

interface MenuItem {
  id: string;
  label: string;
  description: string;
  shortcut?: string;
}

const MAIN_MENU: MenuItem[] = [
  { id: "settings", label: "Settings", description: "Configure provider, model, and preferences", shortcut: "/settings" },
  { id: "skills", label: "Skills", description: "Manage installed skills and plugins", shortcut: "/skills" },
  { id: "agents", label: "Agents", description: "View and manage active agents", shortcut: "/agents" },
  { id: "memory", label: "Memory", description: "View and clear conversation history", shortcut: "/memory" },
  { id: "clear", label: "Clear", description: "Clear the console output", shortcut: "/clear" },
  { id: "help", label: "Help", description: "Show available commands", shortcut: "/help" },
  { id: "quit", label: "Quit", description: "Exit the application", shortcut: "/quit" },
];

export class ModernTUI {
  private logs: LogEntry[] = [];
  private width: number;
  private height: number;
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
  private renderTimeout: NodeJS.Timeout | null = null;
  private rl: readline.Interface | null = null;

  constructor() {
    this.width = process.stdout.columns || 80;
    this.height = process.stdout.rows || 30;
    
    process.stdout.on("resize", () => {
      this.width = process.stdout.columns || 80;
      this.height = process.stdout.rows || 30;
      this.render();
    });
  }

  public log(level: LogEntry["level"], message: string, source?: string): void {
    this.logs.push({ timestamp: new Date(), level, message, source });
    if (this.logs.length > 100) this.logs.shift();
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

  public debug(message: string, source?: string): void {
    this.log("debug", message, source);
  }

  public setProvider(p: string) { this.provider = p; this.scheduleRender(); }
  public setModel(m: string) { this.model = m; this.scheduleRender(); }
  public setSkillsCount(n: number) { this.skillsCount = n; this.scheduleRender(); }
  public setStatus(s: "idle" | "active" | "error") { this.status = s; this.scheduleRender(); }

  private scheduleRender(): void {
    if (this.renderTimeout) clearTimeout(this.renderTimeout);
    this.renderTimeout = setTimeout(() => this.render(), 30);
  }

  private getLevelIcon(level: LogEntry["level"]): { icon: string; color: (s: string) => string } {
    switch (level) {
      case "info": return { icon: "›", color: c.white };
      case "warn": return { icon: "▸", color: c.orange };
      case "error": return { icon: "✕", color: c.orangeDark };
      case "success": return { icon: "✓", color: c.white };
      case "debug": return { icon: "◦", color: c.gray };
    }
  }

  private getStatusIndicator(): { icon: string; text: string } {
    switch (this.status) {
      case "active": return { icon: "●", text: "ready" };
      case "error": return { icon: "●", text: "error" };
      case "idle": return { icon: "○", text: "idle" };
    }
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString("en-US", { 
      hour12: false, 
      hour: "2-digit", 
      minute: "2-digit"
    });
  }

  private getUptime(): string {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}`;
    return `${minutes}m`;
  }

  private getMemory(): string {
    const used = Math.round((process.memoryUsage().heapUsed / 1024 / 1024));
    return `${used}MB`;
  }

  private render(): void {
    if (!this.isRunning) return;

    const w = Math.min(this.width, 90);
    const lines: string[] = [];

    // Header
    const status = this.getStatusIndicator();
    const headerLeft = ` openhiru `;
    const headerRight = ` ${status.icon} ${this.provider || "..."} · ${this.getUptime()} `;
    const headerPad = " ".repeat(Math.max(0, w - visibleLength(headerLeft) - visibleLength(headerRight) - 2));
    lines.push(c.grayDark("┌" + "─".repeat(w - 2) + "┐"));
    lines.push(c.grayDark("│") + c.orange(headerLeft) + headerPad + c.gray(headerRight) + c.grayDark("│"));

    // Info bar
    const infoLeft = ` ${this.model || "no model"} · ${this.skillsCount} skills `;
    const infoRight = ` ${this.getMemory()} `;
    const infoPad = " ".repeat(Math.max(0, w - visibleLength(infoLeft) - visibleLength(infoRight) - 2));
    lines.push(c.grayDark("├" + "─".repeat(w - 2) + "┤"));
    lines.push(c.grayDark("│") + c.whiteDim(infoLeft) + infoPad + c.gray(infoRight) + c.grayDark("│"));
    lines.push(c.grayDark("├" + "─".repeat(w - 2) + "┤"));

    // Content area
    const contentHeight = this.showMenu ? Math.max(8, this.height - 18) : this.height - 12;
    const visibleLogs = this.logs.slice(-contentHeight);
    
    for (let i = 0; i < contentHeight; i++) {
      const log = visibleLogs[i];
      if (log) {
        const { icon, color } = this.getLevelIcon(log.level);
        const time = c.gray(this.formatTime(log.timestamp));
        const source = log.source ? c.orangeDark(`[${log.source}]`) : "";
        const msg = color(log.message);
        const logText = `${icon} ${time} ${source} ${msg}`;
        
        // Truncate based on visible length without breaking ANSI codes
        let truncated = logText;
        if (visibleLength(logText) > w - 4) {
          // Simplistic but safe truncation: strip ANSI, truncate, re-strip (lossy but stable)
          // Better: just let it be or use a library. Here we just cap it visually.
          truncated = logText.slice(0, w + 100); // Allow some extra for ANSI codes
        }
        
        const padding = " ".repeat(Math.max(0, w - 4 - visibleLength(truncated)));
        lines.push(c.grayDark("│ ") + truncated + padding + c.grayDark(" │"));
      } else {
        lines.push(c.grayDark("│") + " ".repeat(w - 2) + c.grayDark("│"));
      }
    }

    // Menu overlay (if showing)
    if (this.showMenu) {
      const menuHeight = Math.min(MAIN_MENU.length + 4, 12);
      const menuWidth = Math.min(50, w - 10);
      const menuStart = lines.length - menuHeight - 2;
      
      const filteredMenu = this.menuFilter 
        ? MAIN_MENU.filter(item => item.label.toLowerCase().includes(this.menuFilter.toLowerCase()))
        : MAIN_MENU;
      
      const menuLines: string[] = [];
      menuLines.push(c.white("┌" + "─".repeat(menuWidth - 2) + "┐"));
      menuLines.push(c.white("│") + c.orange(" Command Palette ".padEnd(menuWidth - 2)) + c.white("│"));
      menuLines.push(c.white("├" + "─".repeat(menuWidth - 2) + "┤"));
      
      filteredMenu.slice(0, menuHeight - 4).forEach((item, idx) => {
        const isSelected = idx === this.selectedMenuIndex;
        const prefix = isSelected ? c.orange("› ") : "  ";
        const label = isSelected ? c.orange(item.label) : c.white(item.label);
        const desc = c.gray(item.description.slice(0, menuWidth - visibleLength(prefix) - visibleLength(label) - 5));
        const line = `${prefix}${label} ${desc}`;
        const padding = " ".repeat(Math.max(0, menuWidth - 2 - visibleLength(line)));
        menuLines.push(c.white("│") + line + padding + c.white("│"));
      });
      
      menuLines.push(c.white("├" + "─".repeat(menuWidth - 2) + "┤"));
      menuLines.push(c.white("│") + c.gray(` Type to filter · ESC to close `.padEnd(menuWidth - 2)) + c.white("│"));
      menuLines.push(c.white("└" + "─".repeat(menuWidth - 2) + "┘"));

      // Overlay menu on content
      const startIdx = Math.max(0, lines.length - menuLines.length - 2);
      for (let i = 0; i < menuLines.length && (startIdx + i) < lines.length; i++) {
        lines[startIdx + i] = "  " + menuLines[i];
      }
    }

    // Input bar
    lines.push(c.grayDark("├" + "─".repeat(w - 2) + "┤"));
    const prompt = this.showMenu ? " /" : " ❯ ";
    const inputText = this.showMenu ? this.menuFilter : this.currentInput;
    const inputContent = c.orange(prompt) + c.white(inputText);
    const cursor = !this.showMenu ? c.orange("_") : "";
    const inputPad = " ".repeat(Math.max(0, w - visibleLength(inputContent) - visibleLength(cursor) - 2));
    lines.push(c.grayDark("│") + inputContent + cursor + inputPad + c.grayDark("│"));
    lines.push(c.grayDark("└" + "─".repeat(w - 2) + "┘"));

    // Help hint
    const hint = this.showMenu ? "" : " type / for commands ";
    const hintPad = " ".repeat(Math.max(0, w - hint.length - 2));
    lines.push(c.gray(hint) + hintPad);

    // Clear and print
    console.clear();
    console.log(lines.join("\n"));
  }

  public start(): void {
    this.isRunning = true;
    this.render();
    this.setupInput();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.renderTimeout) clearTimeout(this.renderTimeout);
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }

  private setupInput(): void {
    if (this.rl) return;
    
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    process.stdin.on("keypress", (str, key) => {
      // Handle ESC
      if (key.name === "escape") {
        if (this.showMenu) {
          this.showMenu = false;
          this.menuFilter = "";
          this.selectedMenuIndex = 0;
          this.render();
        }
        return;
      }

      // Handle menu mode
      if (this.showMenu) {
        if (key.name === "return") {
          const filteredMenu = this.menuFilter 
            ? MAIN_MENU.filter(item => item.label.toLowerCase().includes(this.menuFilter.toLowerCase()))
            : MAIN_MENU;
          const selected = filteredMenu[this.selectedMenuIndex];
          if (selected) {
            this.showMenu = false;
            this.menuFilter = "";
            this.selectedMenuIndex = 0;
            this.handleCommand(selected.shortcut || `/${selected.id}`);
          }
          return;
        } else if (key.name === "up") {
          this.selectedMenuIndex = Math.max(0, this.selectedMenuIndex - 1);
          this.render();
          return;
        } else if (key.name === "down") {
          const filteredMenu = this.menuFilter 
            ? MAIN_MENU.filter(item => item.label.toLowerCase().includes(this.menuFilter.toLowerCase()))
            : MAIN_MENU;
          this.selectedMenuIndex = Math.min(filteredMenu.length - 1, this.selectedMenuIndex + 1);
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

      // Handle normal mode
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

  private handleCommand(cmd: string): void {
    if (!cmd) return;
    
    this.log("debug", `Command: ${cmd}`, "input");
    
    if (cmd === "/quit" || cmd === "/exit" || cmd === "q") {
      this.info("Shutting down...", "system");
      setTimeout(() => process.exit(0), 500);
    } else if (cmd === "/clear" || cmd === "cls") {
      this.logs = [];
      this.success("Console cleared", "system");
    } else if (cmd === "/settings" || cmd === "/s") {
      this.showSettingsPopup();
    } else if (cmd === "/skills" || cmd === "/sk") {
      this.showSkillsPopup();
    } else if (cmd === "/agents" || cmd === "/a") {
      this.showAgentsPopup();
    } else if (cmd === "/memory" || cmd === "/m") {
      this.showMemoryPopup();
    } else if (cmd === "/help" || cmd === "/h" || cmd === "?") {
      this.showHelpPopup();
    } else {
      this.warn(`Unknown command: ${cmd}. Type / for menu.`, "system");
    }
  }

  private showSettingsPopup(): void {
    const w = 55;
    const lines: string[] = [];
    
    lines.push("");
    lines.push("  " + c.white("╭" + "─".repeat(w - 4) + "╮"));
    lines.push("  " + c.white("│") + pad(c.orange(" ⚙ SETTINGS "), w - 4) + c.white("│"));
    lines.push("  " + c.white("├" + "─".repeat(w - 4) + "┤"));
    lines.push("  " + c.white("│") + pad(`  ${c.orange("1.")} ${c.white("Provider")}  ${c.gray(this.provider || "not set")}`, w - 4) + c.white("│"));
    lines.push("  " + c.white("│") + pad(`  ${c.orange("2.")} ${c.white("Model")}     ${c.gray(this.model || "not set")}`, w - 4) + c.white("│"));
    lines.push("  " + c.white("│") + pad(`  ${c.orange("3.")} ${c.white("Skills")}    ${c.gray(String(this.skillsCount))}`, w - 4) + c.white("│"));
    lines.push("  " + c.white("│") + pad(`  ${c.orange("4.")} ${c.white("Memory")}    ${c.gray(this.getMemory())}`, w - 4) + c.white("│"));
    lines.push("  " + c.white("├" + "─".repeat(w - 4) + "┤"));
    lines.push("  " + c.white("│") + pad(c.gray("  Press 1-4 to edit, Enter to close "), w - 4) + c.white("│"));
    lines.push("  " + c.white("╰" + "─".repeat(w - 4) + "╯"));
    lines.push("");
    
    console.clear();
    console.log(lines.join("\n"));
    
    const tempRl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    tempRl.question(c.gray("  ❯ "), () => {
      tempRl.close();
      this.render();
    });
  }

  private showSkillsPopup(): void {
    const w = 55;
    const lines: string[] = [];
    
    lines.push("");
    lines.push("  " + c.white("╭" + "─".repeat(w - 4) + "╮"));
    lines.push("  " + c.white("│") + c.orange(" ⚡ SKILLS ".padEnd(w - 4)) + c.white("│"));
    lines.push("  " + c.white("├" + "─".repeat(w - 4) + "┤"));
    lines.push("  " + c.white("│") + c.gray(`  Installed: ${this.skillsCount} skills`.padEnd(w - 4)) + c.white("│"));
    lines.push("  " + c.white("├" + "─".repeat(w - 4) + "┤"));
    lines.push("  " + c.white("│") + c.gray("  Commands:".padEnd(w - 4)) + c.white("│"));
    lines.push("  " + c.white("│") + `   ${c.orange("/skill list")}    ${c.gray("· List all skills")}`.padEnd(w + 5) + c.white("│"));
    lines.push("  " + c.white("│") + `   ${c.orange("/skill add")}     ${c.gray("· Add new skill")}`.padEnd(w + 5) + c.white("│"));
    lines.push("  " + c.white("│") + `   ${c.orange("/skill remove")}  ${c.gray("· Remove skill")}`.padEnd(w + 5) + c.white("│"));
    lines.push("  " + c.white("├" + "─".repeat(w - 4) + "┤"));
    lines.push("  " + c.white("│") + c.gray("  Press Enter to close ".padEnd(w - 4)) + c.white("│"));
    lines.push("  " + c.white("╰" + "─".repeat(w - 4) + "╯"));
    lines.push("");
    
    console.clear();
    console.log(lines.join("\n"));
    
    const tempRl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    tempRl.question(c.gray("  "), () => {
      tempRl.close();
      this.render();
    });
  }

  private showAgentsPopup(): void {
    const w = 55;
    const lines: string[] = [];
    
    lines.push("");
    lines.push("  " + c.white("╭" + "─".repeat(w - 4) + "╮"));
    lines.push("  " + c.white("│") + c.orange(" ◉ AGENTS ".padEnd(w - 4)) + c.white("│"));
    lines.push("  " + c.white("├" + "─".repeat(w - 4) + "┤"));
    lines.push("  " + c.white("│") + c.gray("  Active agents:".padEnd(w - 4)) + c.white("│"));
    lines.push("  " + c.white("│") + `   ${c.orange("●")} ${c.white("main")} ${c.gray("· Telegram bridge active")}`.padEnd(w + 3) + c.white("│"));
    lines.push("  " + c.white("├" + "─".repeat(w - 4) + "┤"));
    lines.push("  " + c.white("│") + c.gray("  Press Enter to close ".padEnd(w - 4)) + c.white("│"));
    lines.push("  " + c.white("╰" + "─".repeat(w - 4) + "╯"));
    lines.push("");
    
    console.clear();
    console.log(lines.join("\n"));
    
    const tempRl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    tempRl.question(c.gray("  "), () => {
      tempRl.close();
      this.render();
    });
  }

  private showMemoryPopup(): void {
    const w = 55;
    const lines: string[] = [];
    
    lines.push("");
    lines.push("  " + c.white("╭" + "─".repeat(w - 4) + "╮"));
    lines.push("  " + c.white("│") + c.orange(" ◆ MEMORY ".padEnd(w - 4)) + c.white("│"));
    lines.push("  " + c.white("├" + "─".repeat(w - 4) + "┤"));
    lines.push("  " + c.white("│") + c.gray(`  Messages: ${this.logs.length}`.padEnd(w - 4)) + c.white("│"));
    lines.push("  " + c.white("│") + c.gray(`  Memory usage: ${this.getMemory()}`.padEnd(w - 4)) + c.white("│"));
    lines.push("  " + c.white("├" + "─".repeat(w - 4) + "┤"));
    lines.push("  " + c.white("│") + `  ${c.orange("/clear")} ${c.gray("· Clear all messages")}`.padEnd(w + 5) + c.white("│"));
    lines.push("  " + c.white("├" + "─".repeat(w - 4) + "┤"));
    lines.push("  " + c.white("│") + c.gray("  Press Enter to close ".padEnd(w - 4)) + c.white("│"));
    lines.push("  " + c.white("╰" + "─".repeat(w - 4) + "╯"));
    lines.push("");
    
    console.clear();
    console.log(lines.join("\n"));
    
    const tempRl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    tempRl.question(c.gray("  "), () => {
      tempRl.close();
      this.render();
    });
  }

  private showHelpPopup(): void {
    const w = 60;
    const lines: string[] = [];
    
    lines.push("");
    lines.push("  " + c.white("╭" + "─".repeat(w - 4) + "╮"));
    lines.push("  " + c.white("│") + c.orange(" ? HELP ".padEnd(w - 4)) + c.white("│"));
    lines.push("  " + c.white("├" + "─".repeat(w - 4) + "┤"));
    lines.push("  " + c.white("│") + `  ${c.orange("/")}        ${c.gray("· Open command palette")}`.padEnd(w + 8) + c.white("│"));
    lines.push("  " + c.white("│") + `  ${c.orange("/settings")}  ${c.gray("· Configure settings")}`.padEnd(w + 8) + c.white("│"));
    lines.push("  " + c.white("│") + `  ${c.orange("/skills")}    ${c.gray("· Manage skills")}`.padEnd(w + 8) + c.white("│"));
    lines.push("  " + c.white("│") + `  ${c.orange("/agents")}    ${c.gray("· View active agents")}`.padEnd(w + 8) + c.white("│"));
    lines.push("  " + c.white("│") + `  ${c.orange("/memory")}    ${c.gray("· Memory info")}`.padEnd(w + 8) + c.white("│"));
    lines.push("  " + c.white("│") + `  ${c.orange("/clear")}     ${c.gray("· Clear console")}`.padEnd(w + 8) + c.white("│"));
    lines.push("  " + c.white("│") + `  ${c.orange("/quit")}      ${c.gray("· Exit application")}`.padEnd(w + 8) + c.white("│"));
    lines.push("  " + c.white("│") + `  ${c.orange("ESC")}        ${c.gray("· Close menu/popup")}`.padEnd(w + 8) + c.white("│"));
    lines.push("  " + c.white("├" + "─".repeat(w - 4) + "┤"));
    lines.push("  " + c.white("│") + c.gray("  Press Enter to close ".padEnd(w - 4)) + c.white("│"));
    lines.push("  " + c.white("╰" + "─".repeat(w - 4) + "╯"));
    lines.push("");
    
    console.clear();
    console.log(lines.join("\n"));
    
    const tempRl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    tempRl.question(c.gray("  "), () => {
      tempRl.close();
      this.render();
    });
  }

  public clear(): void {
    this.logs = [];
    this.scheduleRender();
  }
}

// Export for external use
export async function showSettingsModal(currentConfig: any): Promise<any> {
  const lines: string[] = [];
  const w = 55;
  
  lines.push("");
  lines.push("  " + c.white("╭" + "─".repeat(w - 4) + "╮"));
  lines.push("  " + c.white("│") + c.orange(" ⚙ SETTINGS ".padEnd(w - 4)) + c.white("│"));
  lines.push("  " + c.white("├" + "─".repeat(w - 4) + "┤"));
  lines.push("  " + c.white("│") + `  ${c.orange("1.")} ${c.white("Provider")}  ${c.gray(currentConfig.provider || "not set")}`.padEnd(w + 5) + c.white("│"));
  lines.push("  " + c.white("│") + `  ${c.orange("2.")} ${c.white("Model")}     ${c.gray(currentConfig.model || "not set")}`.padEnd(w + 5) + c.white("│"));
  lines.push("  " + c.white("│") + `  ${c.orange("3.")} ${c.white("Telegram")}  ${c.gray(currentConfig.telegramBotToken ? "✓ configured" : "✗ not set")}`.padEnd(w + 5) + c.white("│"));
  lines.push("  " + c.white("│") + `  ${c.orange("4.")} ${c.white("Gateway")}   ${c.gray(String(currentConfig.gatewayPort || "18790"))}`.padEnd(w + 5) + c.white("│"));
  lines.push("  " + c.white("├" + "─".repeat(w - 4) + "┤"));
  lines.push("  " + c.white("│") + c.gray("  Press 1-4 to edit, q to close ".padEnd(w - 4)) + c.white("│"));
  lines.push("  " + c.white("╰" + "─".repeat(w - 4) + "╯"));
  lines.push("");
  
  console.clear();
  console.log(lines.join("\n"));

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(c.gray("  ❯ "), (answer) => {
      rl.close();
      resolve({ action: answer.trim() });
    });
  });
}
