import chalk from "chalk";
import { c, THEME as THEME_COLORS } from "./theme.js";
import { HiruConfig } from "shared";
import { PROVIDERS, createProviderInstance, fetchOpenRouterModels, fetchOllamaModels } from "../providers/index.js";
import { saveConfig } from "../utils/config.js";
import * as readline from "readline";
import { spawn } from "child_process";

export interface SimpleLogEntry {
  timestamp: Date;
  level: "info" | "warn" | "error" | "success" | "debug" | "thinking";
  message: string;
  source?: string;
}

const LOGO = [
  "█▀█ █▀█ █▀▀ █▄ █ █ █ █ █▀█ █ █",
  "█▄█ █▀▀ ██▄ █ ▀█ █▀█ █ █▀▄ █▄█",
];

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * A ultra-polished, single-panel minimalist TUI for OpenHiru with Settings Modal.
 */
export class SimpleTUI {
  private logs: SimpleLogEntry[] = [];
  private isRunning: boolean = false;
  private provider = "";
  private model = "";
  private skillsCount = 0;
  private tokens = 0;
  private status: "idle" | "active" | "error" = "idle";
  private startTime = Date.now();
  private pulse = 0;
  private timer: NodeJS.Timeout | null = null;
  private renderTimeout: NodeJS.Timeout | null = null;
  private keyboardAttached = false;

  // Settings State
  public onConfigChange?: (config: HiruConfig) => void;
  private config: HiruConfig;
  private isSettingsOpen = false;
  private settingsIndex = 0;
  private settingsView: "main" | "provider" | "model" | "channel" | "channelConfig" | "input" | "updateConfirm" | "downloading" = "main";
  private tempInput = "";
  private inputField = ""; // Label for what we are inputting
  private inputTarget = ""; // Key we are currently editing in config

  // BUG FIX: Guard flag to prevent re-entrant async key handling (race condition)
  private isProcessingKey = false;

  private lastKeyPressTime = 0;
  private readonly KEY_PRESS_DEBOUNCE_MS = 300;
  private settingsOpenedByKey = false;
  private dynamicModels: string[] = [];
  private isLoadingModels = false;
  private pendingRender = false;

  // BUG FIX: Store bound listener references so they can be properly removed on stop()
  private keyHandler: ((str: string, key: any) => void) | null = null;
  private resizeHandler: (() => void) | null = null;
  private dataHandler: ((chunk: Buffer) => void) | null = null;
  private logsScrollOffset = 0;
  private searchQuery = "";

  private currentVersion: string;

  constructor(config: HiruConfig, version: string = "1.4.7") {
    this.config = config;
    this.currentVersion = version;
    this.provider = config.provider;
    this.model = config.model;
  }

  private visibleLength(str: string): number {
    return str.replace(/\x1b\[[0-9;]*m/g, "").length;
  }

  private center(str: string, width: number): string {
    const len = this.visibleLength(str);
    const pad = Math.max(0, Math.floor((width - len) / 2));
    return " ".repeat(pad) + str;
  }

  private scheduleRender(): void {
    if (this.pendingRender) return;
    this.pendingRender = true;
    if (this.renderTimeout) clearTimeout(this.renderTimeout);
    this.renderTimeout = setTimeout(() => {
      this.pendingRender = false;
      this.render();
    }, 16);
  }

  private async loadDynamicModels() {
    if (this.isLoadingModels) return;
    const provider = this.config.provider;
    if (provider === "openrouter") {
      this.isLoadingModels = true;
      this.dynamicModels = [];
      this.scheduleRender();
      try {
        const apiKey = this.config.apiKeys?.openrouter || this.config.apiKey || "";
        const models = await fetchOpenRouterModels(apiKey);
        this.dynamicModels = models.map(m => m.id).slice(0, 50);
      } catch {}
      this.isLoadingModels = false;
      this.scheduleRender();
    } else if (provider === "ollama") {
      this.isLoadingModels = true;
      this.dynamicModels = [];
      this.scheduleRender();
      try {
        const models = await fetchOllamaModels(this.config.baseUrl);
        this.dynamicModels = models.slice(0, 50);
      } catch {}
      this.isLoadingModels = false;
      this.scheduleRender();
    } else {
      this.dynamicModels = [];
    }
  }

  public log(level: SimpleLogEntry["level"], message: string, source?: string): void {
    this.logs.push({ timestamp: new Date(), level, message, source });
    if (this.logs.length > 50) this.logs.shift();
    if (this.isRunning) this.scheduleRender();
  }

  public info    (m: string, s?: string) { this.log("info",     m, s); }
  public warn    (m: string, s?: string) { this.log("warn",     m, s); }
  public error   (m: string, s?: string) { this.log("error",    m, s); }
  public success (m: string, s?: string) { this.log("success",  m, s); }
  public thinking(m: string, s?: string) { this.log("thinking", m, s); }
  public debug   (m: string, s?: string) { this.log("debug",    m, s); }

  public setProvider(p: string) { this.provider = p; if (this.isRunning) this.scheduleRender(); }
  public setModel(m: string) { this.model = m; if (this.isRunning) this.scheduleRender(); }
  public setSkillsCount(n: number) { this.skillsCount = n; if (this.isRunning) this.scheduleRender(); }
  public setStatus(s: "idle" | "active" | "error") { this.status = s; if (this.isRunning) this.scheduleRender(); }
  public setTokens(n: number) { this.tokens = n; if (this.isRunning) this.scheduleRender(); }

  public openSettings() {
    this.isSettingsOpen = true;
    this.settingsIndex = 0;
    this.settingsView = "main";
  }

  private getUptime(): string {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
  }
  private getChannelFields(channel: string) {
    if (channel === "Telegram") {
      return [
        { label: "Bot Token", key: "telegramBotToken", value: this.config.telegramBotToken || "" },
        { label: "Chat ID", key: "telegramAllowedChatId", value: this.config.telegramAllowedChatId || "" }
      ];
    }
    // Generic
    return [
      { label: `${channel} Token`, key: `${channel.toLowerCase()}Token`, value: (this.config as any)[`${channel.toLowerCase()}Token`] || "" }
    ];
  }
  private render(): void {
    if (!this.isRunning) return;
    const rows = process.stdout.rows || 24;
    const cols = process.stdout.columns || 80;

    // Use H to go home, and J to clear everything below to avoid artifacts (closed popups, etc)
    let buf = "\x1b[H\x1b[J\x1b[?25l";

    // "Gelap" (Dimming) helper when modal is open
    const d = (s: string) => this.isSettingsOpen ? chalk.dim(s) : s;

    // 1. Fixed Header (Logo & Status)
    const logoColors = [chalk.hex(THEME_COLORS.light), chalk.hex(THEME_COLORS.primary)];
    buf += "\n";
    for (let i = 0; i < LOGO.length; i++) {
        buf += d(this.center(logoColors[i](LOGO[i]), cols)) + "\n";
    }

    const statusIcon = this.status === "active" ? c.green("●") : this.status === "error" ? c.red("●") : c.dark("○");
    const statusText = `${statusIcon} ${c.white("OPENHIRU")} ${c.dark("|")} ${c.muted(this.status.toUpperCase())}`;
    buf += d(this.center(statusText, cols)) + "\n";

    const contextLine = `${c.dark("MOD:")} ${c.muted(this.provider || "...")}  ${c.dark("MODEL:")} ${c.muted(this.model || "...")}`;
    buf += d(this.center(contextLine, cols)) + "\n";
    buf += d(this.center(c.dark("─".repeat(16)), cols)) + "\n";

    // 2. Main Log Area
    // Calculate space: 1(top) + 2(logo) + 1(status) + 1(context) + 1(divider) + 1(spacer) = 7 rows
    // Footer takes 2 rows. Total fixed = 9 rows.
    const fixedRows = 10;
    const logHeight = Math.max(4, rows - fixedRows);
    
    const end = this.logs.length - this.logsScrollOffset;
    const start = Math.max(0, end - logHeight);
    const visibleLogs = this.logs.slice(start, end);
    
    const logLines = visibleLogs.map(log => {
      const time = log.timestamp.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
      let tag = c.dark("•");
      
      // CRITICAL: Sanitize message (no newlines, truncated to fit)
      let msg = log.message.replace(/\n/g, " ").trim();
      const maxMsgLen = cols - 20; // 20 for time and tag
      if (msg.length > maxMsgLen) msg = msg.substring(0, maxMsgLen - 3) + "...";

      if (log.level === "success") { tag = c.green("✓"); msg = c.white(msg); }
      else if (log.level === "error") { tag = c.red("✕"); msg = c.red(msg); }
      else if (log.level === "warn") { tag = chalk.yellow("!"); msg = chalk.yellow(msg); }
      else if (log.level === "thinking") {
          tag = c.glow(SPINNER[this.pulse % SPINNER.length]);
          msg = c.glow(msg);
      } else if (log.level === "debug") {
          tag = c.dark("·");
          msg = c.dark(msg);
      } else {
          msg = c.muted(msg);
      }
      return d(`${c.dark(time)}  ${tag}  ${msg}`);
    });

    // Scroll indicator
    if (this.logsScrollOffset > 0) {
        logLines.unshift(chalk.yellow.dim(`   ↑ Scrolling History (${this.logsScrollOffset} lines hidden below)`));
    }

    const maxVisibleWidth = logLines.length > 0 ? Math.max(...logLines.map(l => this.visibleLength(l))) : 0;
    const leftPadNum = Math.max(0, Math.floor((cols - maxVisibleWidth) / 2));
    const leftPad = " ".repeat(leftPadNum);

    logLines.forEach(line => buf += leftPad + line + "\n");

    const gap = logHeight - logLines.length;
    if (gap > 0) buf += d("\n".repeat(gap));

    buf += "\n";
    const scrollInfo = this.logsScrollOffset > 0 ? chalk.yellow(" [SCROLLING] ") : "";
    const footer = `${c.dark("SKILLS")} ${this.skillsCount}   ${c.dark("USAGE")} ${Math.floor(this.tokens/1000)}k   ${c.dark("UPTIME")} ${this.getUptime()}`;
    const hint = `   ${c.dark("[ctrl+s settings]")}${scrollInfo}`;
    buf += d(this.center(footer + hint, cols)) + "\n";

    if (this.isSettingsOpen) {
        buf += this.drawSettingsModal(rows, cols);
    } else {
        // Only show natural terminal cursor if settings are NOT open to avoid artifacts
        buf += "\x1b[?25l";
    }

    // 3. Persistent Version Display (Bottom Right)
    const verStr = ` OpenHiru v${this.currentVersion} `;
    const verTxt = c.dark(verStr);
    // Rows-0 is usually safe for status info
    buf += this.at(rows, cols - verStr.length) + verTxt;

    // 4. Update notification (Positioned above version if available)
    if (this.updateAvailableVersion) {
        const updateStr = ` Update v${this.updateAvailableVersion} available! [ctrl+u] `;
        const updateTxt = chalk.bgHex(THEME_COLORS.purple).white.bold(updateStr);
        const updateLen = updateStr.length;
        // One row above the version string
        buf += this.at(rows - 1, cols - updateLen) + updateTxt;
    }

    // Clear everything below the buffer to prevent duplication
    buf += "\x1b[J";
    buf += "\x1b[" + rows + ";1H";

    process.stdout.write(buf);

    // After writing the buffer, if we are in input mode, position the REAL cursor
    if (this.isSettingsOpen && this.settingsView === "input") {
        const modalW = 65;
        const modalH = 20;
        const startRow = Math.max(1, Math.floor((rows - modalH) / 2));
        const startCol = Math.max(1, Math.floor((cols - modalW) / 2));
        // Input row is 6, box starts at col 3 + padding 1 = 4
        // Show cursor and position it
        process.stdout.write(`\x1b[${startRow + 6};${startCol + 4 + this.tempInput.length}H\x1b[?25h`);
    } else {
        process.stdout.write("\x1b[?25l");
    }
  }

  private drawSettingsModal(rows: number, cols: number): string {
    const modalW = 65;
    const modalH = 20;
    const startRow = Math.max(1, Math.floor((rows - modalH) / 2));
    const startCol = Math.max(1, Math.floor((cols - modalW) / 2));

    let modal = "";
    
    // Helper to draw a row exactly as in the image
    const drawRow = (r: number, content: string, background?: string) => {
        let line = content;
        const visibleLen = this.visibleLength(line);
        const pad = " ".repeat(Math.max(0, modalW - visibleLen));
        
        // ALWAYS apply modal background if no specific background is provided
        const bg = background || THEME_COLORS.modalBg;
        let finalLine = line + pad;
        if (bg === THEME_COLORS.peach) {
            finalLine = chalk.bgHex(bg).black(finalLine);
        } else {
            finalLine = chalk.bgHex(bg)(finalLine);
        }
        return this.at(startRow + r, startCol) + finalLine + "\n";
    };

    // 1. Header: Select model <esc>
    const title = chalk.white.bold("Select model");
    const esc = chalk.dim("esc");
    const headerContent = " " + title + " ".repeat(modalW - this.visibleLength(title) - this.visibleLength(esc) - 2) + esc + " ";
    modal += drawRow(0, headerContent);
    modal += drawRow(1, ""); // Spacer

    // 2. Search Bar
    const searchText = this.searchQuery ? chalk.white(this.searchQuery) : chalk.hex("#555555")("Search");
    modal += drawRow(2, " " + searchText + chalk.white("│"));
    modal += drawRow(3, ""); // Spacer

    if (this.settingsView === "main") {
        const channel = (this.config as any).channel || "WebChat";
        const items = [
            { label: "Provider", value: this.config.provider },
            { label: "Model", value: this.config.model },
            { label: "Channel", value: channel },
            { label: `Configure ${channel}`, value: "→" },
            { label: "Update API Key", value: "" },
            { label: "Check for Updates", value: "" },
            { label: "Close", value: "" }
        ];

        modal += drawRow(4, " " + chalk.hex(THEME_COLORS.purple).bold("General Settings"));
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const isSelected = this.settingsIndex === i;
            const dot = isSelected ? " ● " : "   ";
            const label = dot + item.label;
            const value = item.value ? chalk.dim(item.value) : "";
            const content = label + " " + value;
            modal += drawRow(5 + i, content, isSelected ? THEME_COLORS.peach : undefined);
        }
    } else if (this.settingsView === "channelConfig") {
        const channel = (this.config as any).channel || "WebChat";
        modal += drawRow(4, " " + chalk.hex(THEME_COLORS.purple).bold(`${channel} Settings`));
        const fields = this.getChannelFields(channel);
        for (let i = 0; i < fields.length; i++) {
            const isHovered = this.settingsIndex === i;
            const dot = isHovered ? " ● " : "   ";
            const val = fields[i].value ? "********" : "not set";
            modal += drawRow(5 + i, dot + fields[i].label + " " + chalk.dim(val), isHovered ? THEME_COLORS.peach : undefined);
        }
    } else if (this.settingsView === "channel") {
        modal += drawRow(4, " " + chalk.hex(THEME_COLORS.purple).bold("Select Chat Channel"));
        const channels = ["WebChat", "Telegram", "WhatsApp", "Discord", "Twitch"];
        const currentChannel = (this.config as any).channel || "WebChat";
        for (let i = 0; i < channels.length; i++) {
            const isHovered = this.settingsIndex === i;
            const isCurrent = channels[i] === currentChannel;
            const dot = isHovered ? " ● " : isCurrent ? chalk.green(" √ ") : "   ";
            const label = isCurrent ? chalk.green.bold(channels[i]) : channels[i];
            const content = dot + label + (isCurrent ? chalk.green(" (active)") : "");
            modal += drawRow(5 + i, content, isHovered ? THEME_COLORS.peach : undefined);
        }
    } else if (this.settingsView === "provider") {
        modal += drawRow(4, " " + chalk.hex(THEME_COLORS.purple).bold("Available Providers"));
        const filteredProviders = PROVIDERS.filter(p => p.id.toLowerCase().includes(this.searchQuery.toLowerCase()));
        const displayLimit = 10;
        const scroll = Math.max(0, Math.min(this.settingsIndex - 4, filteredProviders.length - displayLimit));
        for (let i = 0; i < displayLimit; i++) {
            const pIdx = i + scroll;
            const prov = filteredProviders[pIdx];
            if (prov) {
                const isHovered = this.settingsIndex === pIdx;
                const isCurrent = prov.id === this.config.provider;
                const dot = isHovered ? " ● " : isCurrent ? chalk.green(" √ ") : "   ";
                const label = isCurrent ? chalk.green.bold(prov.id) : prov.id;
                const content = dot + label + (isCurrent ? chalk.green(" (active)") : "");
                modal += drawRow(5 + i, content, isHovered ? THEME_COLORS.peach : undefined);
            }
        }
    } else if (this.settingsView === "model") {
        const providerDef = PROVIDERS.find(p => p.id === this.config.provider);
        const staticModels = providerDef?.models.map(m => ({ id: m.id, provider: this.config.provider, tag: m.recommended ? "Best" : "" })) || [];
        const dynamicEntries = this.dynamicModels.map(m => ({ id: m, provider: this.config.provider, tag: "Free" }));
        let allModels = [...staticModels, ...dynamicEntries];
        
        if (this.searchQuery) {
            allModels = allModels.filter(m => m.id.toLowerCase().includes(this.searchQuery.toLowerCase()));
        }
        allModels.push({ id: "Add Custom Model...", provider: "", tag: "✎" });

        const loadingTxt = this.isLoadingModels ? chalk.yellow(" (reloading...)") : "";
        modal += drawRow(4, " " + chalk.hex(THEME_COLORS.purple).bold("Recent") + loadingTxt);
        
        const displayCount = 12;
        const scrollOffset = Math.max(0, Math.min(this.settingsIndex - 5, allModels.length - displayCount));
        
        for (let i = 0; i < displayCount; i++) {
            const mIdx = i + scrollOffset;
            const model = allModels[mIdx];
            if (model) {
                const isHovered = this.settingsIndex === mIdx;
                const isCurrent = model.id === this.config.model;
                const dot = isHovered ? " ● " : isCurrent ? chalk.green(" √ ") : "   ";
                const name = isCurrent ? chalk.green.bold(model.id) : model.id;
                const provider = model.provider ? " " + chalk.dim(model.provider) : "";
                const tag = model.tag ? " ".repeat(modalW - this.visibleLength(dot + model.id + provider + model.tag) - 1) + model.tag : "";
                
                const content = dot + name + provider + tag + (isCurrent ? chalk.green(" (active)") : "");
                modal += drawRow(5 + i, content, isHovered ? THEME_COLORS.peach : undefined);
            }
        }
    } else if (this.settingsView === "input") {
        modal += drawRow(4, " " + chalk.hex(THEME_COLORS.purple).bold(this.inputField));
        modal += drawRow(5, "");
        modal += drawRow(6, "   " + chalk.bgWhite.black(" " + this.tempInput + " "));
        modal += drawRow(7, "");
        modal += drawRow(8, chalk.dim("   ESC: cancel  ENTER: save"));
    } else if (this.settingsView === "updateConfirm") {
        const currentVersion = this.currentVersion;
        modal += drawRow(4, " " + chalk.hex(THEME_COLORS.purple).bold("Update Available"));
        modal += drawRow(5, "");
        modal += drawRow(6, "   " + chalk.dim("Current:") + " " + currentVersion);
        modal += drawRow(7, "   " + chalk.green("Latest:") + " " + this.updateAvailableVersion);
        modal += drawRow(8, "");
        modal += drawRow(9, " " + chalk.hex(THEME_COLORS.purple).bold("Install update?"));
        modal += drawRow(10, "");
        const options = ["Yes, install now", "No, cancel"];
        for (let i = 0; i < options.length; i++) {
            const isSelected = this.settingsIndex === i;
            const dot = isSelected ? " ● " : "   ";
            modal += drawRow(11 + i, dot + options[i], isSelected ? THEME_COLORS.peach : undefined);
        }
        modal += drawRow(14, "");
        modal += drawRow(15, chalk.dim("   ARROWS: select  ENTER: confirm"));
    } else if (this.settingsView === "downloading") {
        modal += drawRow(4, " " + chalk.hex(THEME_COLORS.purple).bold("System Update"));
        modal += drawRow(5, "");
        modal += drawRow(7, "   " + chalk.white("Applying Version:") + " " + chalk.yellow(this.updateAvailableVersion));
        modal += drawRow(9, "   " + chalk.cyan(SPINNER[this.pulse % SPINNER.length]) + " " + chalk.dim(this.downloadOutput.length > 50 ? this.downloadOutput.slice(-50) : this.downloadOutput));
        modal += drawRow(12, "");
        modal += drawRow(13, "   " + chalk.dim("Please wait, do not close the terminal..."));
    }

    // Footer actions
    const footerY = modalH - 2;
    const connect = chalk.white.bold("Connect provider") + " " + chalk.dim("ctrl+a");
    const favorite = chalk.white.bold("Favorite") + " " + chalk.dim("ctrl+f");
    const footerContent = " " + connect + "  " + favorite;
    modal += drawRow(footerY, footerContent);

    // Padding for background
    for (let r = 0; r < modalH; r++) {
        if (!modal.includes(this.at(startRow + r, startCol))) {
            modal += drawRow(r, "");
        }
    }

    return modal;
  }

  private at(r: number, c: number) { return `\x1b[${r};${c}H`; }

  private attachKeyboard() {
    if (!process.stdin.isTTY || this.keyboardAttached) return;
    this.keyboardAttached = true;
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    
    // Enable Mouse Reporting (1002=Cell Motion, 1003=All, 1006=SGR)
    process.stdout.write("\x1b[?1002h\x1b[?1003h\x1b[?1006h");

    this.keyHandler = (str: string, key: any) => {
      if (!key) return;

      if (key.ctrl && key.name === "c") {
        this.stop();
        process.exit(0);
      }

      if (key.ctrl && key.name === "r") {
          this.info("Reloading dynamic components...", "system");
          if (this.isSettingsOpen && this.settingsView === "model") {
              this.loadDynamicModels();
          }
          this.scheduleRender();
          return;
      }

      if (key.ctrl && key.name === "s") {
        const now = Date.now();
        if (now - this.lastKeyPressTime < this.KEY_PRESS_DEBOUNCE_MS) return;
        this.lastKeyPressTime = now;

        if (this.isSettingsOpen) {
          this.isSettingsOpen = false;
          this.scheduleRender();
          return;
        }
        this.isSettingsOpen = true;
        this.settingsIndex = 0;
        this.settingsView = "main";
        this.scheduleRender();
        return;
      }

      if (key.ctrl && key.name === "u") {
          if (this.updateAvailableVersion) {
              this.isSettingsOpen = true;
              this.settingsView = "updateConfirm";
              this.settingsIndex = 0;
              this.scheduleRender();
          } else {
              this.info("No updates available at the moment.", "system");
          }
          return;
      }

      if (this.isSettingsOpen) {
        if (this.settingsView === "input") {
          this.handleSettingsKey(key, str);
        } else if (!this.isProcessingKey) {
          this.isProcessingKey = true;
          this.handleSettingsKey(key, str).finally(() => {
            this.isProcessingKey = false;
          });
        }
        return;
      }

      // Log Scrolling when settings are closed
      if (key.name === "up") {
          this.logsScrollOffset = Math.min(this.logs.length - 1, this.logsScrollOffset + 5);
          this.scheduleRender();
      } else if (key.name === "down") {
          this.logsScrollOffset = Math.max(0, this.logsScrollOffset - 5);
          this.scheduleRender();
      } else if (key.name === "pageup") {
          this.logsScrollOffset = Math.min(this.logs.length - 1, this.logsScrollOffset + 20);
          this.scheduleRender();
      } else if (key.name === "pagedown") {
          this.logsScrollOffset = Math.max(0, this.logsScrollOffset - 20);
          this.scheduleRender();
      } else if (key.name === "home") {
          this.logsScrollOffset = this.logs.length - 1;
          this.scheduleRender();
      } else if (key.name === "end") {
          this.logsScrollOffset = 0;
          this.scheduleRender();
      }
    };

    this.resizeHandler = () => {
      if (this.isRunning) this.scheduleRender();
    };

    // RAW DATA LISTENER for mouse (bypasses readline keypress filtering)
    this.dataHandler = (chunk: Buffer) => {
        const s = chunk.toString();

        // 1. Instant Escape Detection (bypasses readline delay)
        if (chunk.length === 1 && chunk[0] === 27) {
            if (this.isSettingsOpen) {
                this.handleSettingsKey({ name: "escape" }, "").catch(() => {});
                return;
            }
        }

        // 2. Mouse event (SGR format: \x1b[<BTN;X;YM)
        if (s.includes("\x1b[<")) {
            const matches = s.matchAll(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/g);
            for (const match of matches) {
                const x = parseInt(match[2]);
                const y = parseInt(match[3]);
                const btn = parseInt(match[1]);
                const upDown = match[4];
                
                const isClick = (btn === 0 && upDown === "M");
                // Movement codes often range from 32-35 or are reported with 67
                const isHover = (btn >= 32 && btn <= 35) || btn === 67;
                
                if (isClick || isHover) {
                    this.handleMouseEvent(x, y, isClick);
                }
            }
        }
    };

    process.stdin.on("data", this.dataHandler);
    process.stdin.on("keypress", this.keyHandler);
    process.stdout.on("resize", this.resizeHandler);
  }

  private async handleSettingsKey(key: any, str: string) {
    if (this.settingsView === "input") {
      if (key.name === "return") {
        if (this.inputTarget) {
          (this.config as any)[this.inputTarget] = this.tempInput;
          this.success(`Updated ${this.inputTarget}`, "settings");
          await saveConfig(this.config);
          this.onConfigChange?.(this.config);
          this.inputTarget = "";
        } else if (this.inputField.includes("Token/Config")) {
          const ch = (this.config as any).channel || "WebChat";
          if (!(this.config as any).channelTokens) (this.config as any).channelTokens = {};
          (this.config as any).channelTokens[ch] = this.tempInput;
          this.success(`${ch} configuration updated`, "settings");
          await saveConfig(this.config);
          this.onConfigChange?.(this.config);
        } else if (this.inputField.includes("API Key")) {
          if (!this.config.apiKeys) this.config.apiKeys = {};
          this.config.apiKeys[this.config.provider] = this.tempInput;
          this.config.apiKey = this.tempInput; // Also set legacy for compatibility
          await saveConfig(this.config);
          this.onConfigChange?.(this.config);
          this.success(`API Key saved for ${this.config.provider}`, "settings");
        } else if (this.inputField.includes("Model ID")) {
          this.config.model = this.tempInput;
          await saveConfig(this.config);
          this.onConfigChange?.(this.config);
          this.model = this.tempInput;
          this.success(`Model set to ${this.tempInput}`, "settings");
        }
        this.settingsView = "main";
        this.settingsIndex = this.inputField.includes("API Key") ? 2 : 1;
        this.scheduleRender();
        return;
      }
      if (key.name === "escape") {
        this.settingsView = "main";
        this.scheduleRender();
        return;
      }
      if (key.name === "backspace") {
        this.tempInput = this.tempInput.slice(0, -1);
      } else if (str && str.length === 1 && !key.ctrl && !key.meta) {
        // Tolak escape sequences (mouse, dll) tapi terima printable chars dan paste
        if (!key.sequence?.includes('\x1b')) {
          const code = str.charCodeAt(0);
          if (code >= 32 && code < 127) {
            this.tempInput += str;
          }
        }
      }
      this.scheduleRender();
      return;
    }

    // Escape key handling
    if (key.name === "escape") {
      // 1. Clear search first if present
      if (this.searchQuery) {
          this.searchQuery = "";
          this.scheduleRender();
          return;
      }
      // 2. If in sub-view, go back to main
      if (this.settingsView !== "main") {
        this.settingsView = "main";
        this.settingsIndex = 0;
        this.scheduleRender();
        return;
      }
      // 3. Otherwise close
      if (!this.isRunning || this.logs.length === 0) {
          // We are in standalone settings mode
          this.stop();
          process.exit(0);
      }
      this.isSettingsOpen = false;
      this.scheduleRender();
      return;
    }

    if (key.name === "up") {
      this.settingsIndex = Math.max(0, this.settingsIndex - 1);
      this.scheduleRender();
    } else if (key.name === "down") {
      let max = 6;
      if (this.settingsView === "updateConfirm") max = 1;
      else if (this.settingsView === "channel") max = 4;
      else if (this.settingsView === "channelConfig") {
        const fields = this.getChannelFields((this.config as any).channel || "WebChat");
        max = fields.length - 1;
      }
      else if (this.settingsView === "provider") {
          const filtered = PROVIDERS.filter(p => p.id.toLowerCase().includes(this.searchQuery.toLowerCase()));
          max = Math.max(0, filtered.length - 1);
      } else if (this.settingsView === "model") {
        const providerDef = PROVIDERS.find(p => p.id === this.config.provider);
        const staticModels = providerDef?.models.length || 0;
        const dynamicCount = this.dynamicModels.length;
        const total = staticModels + dynamicCount;
        
        if (this.searchQuery) {
            const staticM = providerDef?.models.filter(m => m.id.toLowerCase().includes(this.searchQuery.toLowerCase())) || [];
            const dynamicM = this.dynamicModels.filter(m => m.toLowerCase().includes(this.searchQuery.toLowerCase()));
            max = staticM.length + dynamicM.length; // +1 for custom
        } else {
            max = total;
        }
      }
      this.settingsIndex = Math.min(max, this.settingsIndex + 1);
      this.scheduleRender();
    } else if (key.name === "backspace") {
        this.searchQuery = this.searchQuery.slice(0, -1);
        this.settingsIndex = 0;
        this.scheduleRender();
    } else if (str && str.length === 1 && !key.ctrl && !key.meta && str !== '\r' && str !== '\n') {
        this.searchQuery += str;
        this.settingsIndex = 0;
        this.scheduleRender();
    } else if (key.name === "return" || key.name === "enter") {
      if (this.settingsView === "main") {
        if (this.settingsIndex === 0) { this.settingsView = "provider"; this.settingsIndex = 0; }
        else if (this.settingsIndex === 1) { 
          this.settingsView = "model"; 
          this.settingsIndex = 0; 
          this.loadDynamicModels();
        }
        else if (this.settingsIndex === 2) {
          this.settingsView = "channel";
          this.settingsIndex = 0;
        }
        else if (this.settingsIndex === 3) {
          this.settingsView = "channelConfig";
          this.settingsIndex = 0;
        }
        else if (this.settingsIndex === 4) {
          this.settingsView = "input";
          this.inputField = "Enter API Key:";
          this.inputTarget = "";
          this.tempInput = this.config.apiKeys?.[this.config.provider] || this.config.apiKey || "";
        }
        else if (this.settingsIndex === 5) {
          await this.handleUpdate();
          return;
        }
        else if (this.settingsIndex === 6) { 
            if (!this.isRunning || this.logs.length === 0) {
                this.stop();
                process.exit(0);
            }
            this.isSettingsOpen = false; 
        }
      } else if (this.settingsView === "channelConfig") {
          const channel = (this.config as any).channel || "WebChat";
          const fields = this.getChannelFields(channel);
          const field = fields[this.settingsIndex];
          if (field) {
            this.settingsView = "input";
            this.inputField = `Enter ${field.label}:`;
            this.inputTarget = field.key;
            this.tempInput = field.value || "";
          }
      } else if (this.settingsView === "channel") {
        const channels = ["WebChat", "Telegram", "WhatsApp", "Discord", "Twitch"];
        const ch = channels[this.settingsIndex];
        (this.config as any).channel = ch;
        await saveConfig(this.config);
        this.onConfigChange?.(this.config);
        this.success(`Switched channel to ${ch}`, "settings");
        this.settingsView = "main";
        this.settingsIndex = 2;
      } else if (this.settingsView === "updateConfirm") {
        if (this.settingsIndex === 0) {
          // Yes - install update
          await this.performUpdate();
        } else {
          // No - cancel
          this.settingsView = "main";
          this.settingsIndex = 0;
          this.scheduleRender();
        }
        return;
      } else if (this.settingsView === "provider") {
        const filtered = PROVIDERS.filter(p => p.id.toLowerCase().includes(this.searchQuery.toLowerCase()));
        if (filtered[this.settingsIndex]) {
          const p = filtered[this.settingsIndex].id;
          this.config.provider = p;
          // Pick first model for provider
          this.config.model = filtered[this.settingsIndex].models[0]?.id || "default";
          await saveConfig(this.config);
          this.onConfigChange?.(this.config);
          this.provider = p;
          this.model = this.config.model;
          this.settingsView = "main";
          this.settingsIndex = 0;
          this.searchQuery = "";
          this.success(`Switched provider to ${p}`, "settings");
        }
        this.scheduleRender();
        return;
      } else if (this.settingsView === "model") {
        const providerDef = PROVIDERS.find(p => p.id === this.config.provider);
        const staticModels = providerDef?.models.map(m => ({ id: m.id, provider: this.config.provider, tag: m.recommended ? "Best" : "" })) || [];
        const dynamicEntries = this.dynamicModels.map(m => ({ id: m, provider: this.config.provider, tag: "Free" }));
        let allModels = [...staticModels, ...dynamicEntries];
        if (this.searchQuery) {
            allModels = allModels.filter(m => m.id.toLowerCase().includes(this.searchQuery.toLowerCase()));
        }
        allModels.push({ id: "Add Custom Model...", provider: "", tag: "✎" });
        
        const totalModels = allModels.length - 1; // excluding the last custom entry in our logic
        const idx = this.settingsIndex;
        
        if (idx === allModels.length - 1) {
          // "Add Custom Model..." selected
          this.settingsView = "input";
          this.inputField = "Enter Model ID (e.g. gpt-4o):";
          this.tempInput = "";
        } else {
          let m = allModels[idx]?.id || "";
          if (m) {
            this.config.model = m;
            await saveConfig(this.config);
            this.onConfigChange?.(this.config);
            this.model = m;
            this.success(`Switched to ${m}`, "settings");
          }
          this.settingsView = "main";
          this.settingsIndex = 1;
          this.searchQuery = "";
        }
      }
      this.scheduleRender();
    }
  }

  public start(): void {
    this.isRunning = true;
    this.attachKeyboard();
    // Use Alternate Screen Buffer for "real app" feel
    process.stdout.write("\x1b[?1049h\x1b[H\x1b[2J\x1b[?25l");

    // Check for updates silently in the background
    this.checkForUpdatesSilently();

    this.timer = setInterval(() => {
      this.pulse++;
      const hasThinking = this.logs.some(l => l.level === "thinking");
      if (hasThinking) {
          this.scheduleRender();
      }
    }, 100);
    this.scheduleRender();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timer) clearInterval(this.timer);
    if (this.renderTimeout) clearTimeout(this.renderTimeout);

    // Restore original screen buffer & stop mouse reporting (1002/1003 for movement)
    process.stdout.write("\x1b[?1049l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?25h");

    if (this.keyHandler) {
      process.stdin.off("keypress", this.keyHandler);
      this.keyHandler = null;
    }
    if (this.dataHandler) {
      process.stdin.off("data", this.dataHandler);
      this.dataHandler = null;
    }
    if (this.resizeHandler) {
      process.stdout.off("resize", this.resizeHandler);
      this.resizeHandler = null;
    }
    if (process.stdin.isTTY && this.keyboardAttached) {
      process.stdin.setRawMode(false);
    }
    this.keyboardAttached = false;
  }

  private handleMouseEvent(x: number, y: number, isClick: boolean) {
    // If settings are closed, only open on click
    if (!this.isSettingsOpen) {
        if (isClick) {
            this.isSettingsOpen = true;
            this.settingsIndex = 0;
            this.settingsView = "main";
            this.scheduleRender();
        }
        return;
    }
    const rows = process.stdout.rows || 24;
    const cols = process.stdout.columns || 80;
    const modalW = 65;
    const modalH = 20;
    const startRow = Math.max(1, Math.floor((rows - modalH) / 2));
    const startCol = Math.max(1, Math.floor((cols - modalW) / 2));

    const relY = y - startRow;
    const relX = x - startCol;

    // Hover/Click outside modal:
    if (relX < 0 || relX >= modalW || relY < 0 || relY >= modalH) {
        if (isClick) {
            this.isSettingsOpen = false;
            this.scheduleRender();
        }
        return;
    }

    if (this.settingsView === "input") {
        return;
    } else if (this.settingsView === "updateConfirm") {
        if (relY >= 11 && relY < 13) {
            const idx = relY - 11;
            if (this.settingsIndex !== idx) {
                this.settingsIndex = idx;
                this.scheduleRender();
            }
            if (isClick) this.handleSettingsKey({ name: "return" }, "");
        }
    } else if (this.settingsView === "main") {
        if (relY >= 5 && relY < 11) {
            const idx = relY - 5;
            if (this.settingsIndex !== idx) {
                this.settingsIndex = idx;
                this.scheduleRender();
            }
            if (isClick) this.handleSettingsKey({ name: "return" }, "");
        }
    } else if (this.settingsView === "provider" || this.settingsView === "model" || this.settingsView === "channel" || this.settingsView === "channelConfig") {
        if (relY >= 5 && relY < 17) {
            const rowInList = relY - 5;
            let finalIdx = rowInList;
            
            // CRITICAL: Determine index based on CURRENT scroll, not potential scroll
            if (this.settingsView === "model") {
                const providerDef = PROVIDERS.find(p => p.id === this.config.provider);
                const staticCount = providerDef?.models.length || 0;
                const dynamicCount = this.dynamicModels.length;
                const total = staticCount + dynamicCount + 1; // +1 for "Add Custom Model"
                const currentScroll = Math.max(0, Math.min(this.settingsIndex - 5, total - 12));
                finalIdx = rowInList + currentScroll;
                // Guard against clicking past the end
                if (finalIdx >= total) finalIdx = total - 1;
            } else if (this.settingsView === "provider") {
                const currentScroll = Math.max(0, Math.min(this.settingsIndex - 4, PROVIDERS.length - 10));
                const filtered = PROVIDERS.filter(p => p.id.toLowerCase().includes(this.searchQuery.toLowerCase()));
                finalIdx = rowInList + currentScroll;
                if (finalIdx >= filtered.length) finalIdx = filtered.length - 1;
            } else if (this.settingsView === "channel") {
                finalIdx = rowInList;
                if (finalIdx >= 5) finalIdx = 4;
            } else if (this.settingsView === "channelConfig") {
                const fields = this.getChannelFields((this.config as any).channel || "WebChat");
                finalIdx = rowInList;
                if (finalIdx >= fields.length) finalIdx = fields.length - 1;
            }

            if (this.settingsIndex !== finalIdx) {
                this.settingsIndex = finalIdx;
                this.scheduleRender();
            }
            if (isClick) this.handleSettingsKey({ name: "return" }, "");
        }
    }
  }

  private updateAvailableVersion = "";
  private downloadOutput = "";

  private async handleUpdate(): Promise<void> {
    this.info("Checking for updates...", "update");
    
    return new Promise((resolve) => {
      const npm = spawn("npm", ["view", "@kushuri12/ohiru", "version"], { 
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let latestVersion = "";
      npm.stdout?.on("data", (data) => {
        latestVersion += data.toString().trim();
      });
      
      npm.on("close", (code) => {
        if (code === 0 && latestVersion) {
          const currentVersion = this.currentVersion;
          if (latestVersion !== currentVersion) {
            this.updateAvailableVersion = latestVersion;
            this.settingsView = "updateConfirm";
            this.settingsIndex = 0;
            this.scheduleRender();
          } else {
            this.success("You're already on the latest version!", "update");
            setTimeout(() => {
              this.scheduleRender();
            }, 2000);
          }
        } else {
          this.error("Failed to check for updates", "update");
        }
        resolve();
      });
    });
  }

  private async performUpdate(): Promise<void> {
    this.settingsView = "downloading";
    this.downloadOutput = "Initiating NPM update...";
    this.scheduleRender();
    
    return new Promise((resolve) => {
      // Added --force and --prefer-offline for speed and to overcome permissions/busy files
      const install = spawn("npm", ["install", "-g", `@kushuri12/ohiru@${this.updateAvailableVersion}`, "--force"], {
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      install.stdout?.on("data", (data) => {
        const line = data.toString().trim().split('\n').pop();
        if (line) {
          this.downloadOutput = line;
          this.scheduleRender();
        }
      });

      install.stderr?.on("data", (data) => {
        const line = data.toString().trim().split('\n').pop();
        if (line) {
           this.downloadOutput = line;
           this.scheduleRender();
        }
      });
      
      install.on("close", (installCode) => {
        if (installCode === 0) {
          this.downloadOutput = "Update completed successfully!";
          this.scheduleRender();
          this.success("Update installed successfully!", "update");
          setTimeout(() => {
            process.exit(0); 
          }, 1500);
        } else {
          this.error("Failed to install update", "update");
          this.downloadOutput = "Error: NPM process failed.";
          setTimeout(() => {
            this.settingsView = "main";
            this.settingsIndex = 0;
            this.scheduleRender();
          }, 3000);
        }
        resolve();
      });
    });
  }

  public clear(): void {
    this.logs = [];
    if (this.isRunning) this.scheduleRender();
  }

  private async checkForUpdatesSilently(): Promise<void> {
    try {
      const npm = spawn("npm", ["view", "@kushuri12/ohiru", "version"], { 
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let latestVersion = "";
      npm.stdout?.on("data", (data) => {
        latestVersion += data.toString().trim();
      });
      
      npm.on("close", (code) => {
        if (code === 0 && latestVersion) {
          const currentVersion = this.currentVersion;
          if (latestVersion !== currentVersion) {
            this.updateAvailableVersion = latestVersion;
            this.scheduleRender();
          }
        }
      });
    } catch {
      // Fail silently for background check
    }
  }
}
