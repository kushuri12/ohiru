// src/tools/desktop/openApp.ts
import { z } from "zod";
import { execa } from "execa";
import os from "os";

// Map nama app casual → command yang benar per OS
const APP_MAP: Record<string, { win: string; mac: string; linux: string }> = {
  // Editor teks
  notepad:       { win: "notepad.exe",           mac: "open -a TextEdit",        linux: "gedit" },
  textedit:      { win: "notepad.exe",           mac: "open -a TextEdit",        linux: "gedit" },

  // Browser
  chrome:        { win: "start chrome",          mac: "open -a 'Google Chrome'", linux: "google-chrome" },
  firefox:       { win: "start firefox",         mac: "open -a Firefox",         linux: "firefox" },
  edge:          { win: "start msedge",          mac: "open -a 'Microsoft Edge'",linux: "microsoft-edge" },

  // File manager
  explorer:      { win: "explorer.exe .",        mac: "open .",                  linux: "nautilus ." },
  finder:        { win: "explorer.exe .",        mac: "open .",                  linux: "nautilus ." },

  // Terminal
  terminal:      { win: "start cmd",             mac: "open -a Terminal",        linux: "gnome-terminal" },
  cmd:           { win: "start cmd",             mac: "open -a Terminal",        linux: "gnome-terminal" },
  powershell:    { win: "start powershell",      mac: "open -a Terminal",        linux: "gnome-terminal" },

  // Produktivitas
  calculator:    { win: "calc.exe",              mac: "open -a Calculator",      linux: "gnome-calculator" },
  word:          { win: "start winword",         mac: "open -a 'Microsoft Word'",linux: "libreoffice --writer" },
  excel:         { win: "start excel",           mac: "open -a 'Microsoft Excel'",linux: "libreoffice --calc" },

  // Media
  vlc:           { win: "start vlc",             mac: "open -a VLC",            linux: "vlc" },
  spotify:       { win: "start spotify",         mac: "open -a Spotify",        linux: "spotify" },

  // Lainnya
  vscode:        { win: "code .",                mac: "code .",                 linux: "code ." },
  "vs code":     { win: "code .",                mac: "code .",                 linux: "code ." },
  discord:       { win: "start discord",         mac: "open -a Discord",        linux: "discord" },
  telegram:      { win: "start telegram",        mac: "open -a Telegram",       linux: "telegram-desktop" },
  whatsapp:      { win: "start whatsapp",        mac: "open -a WhatsApp",       linux: "whatsapp-desktop" },
};

export const openAppTool: any = {
  description: `Open an application on the user's computer.
Supports app names like: notepad, chrome, firefox, vscode, calculator, explorer, cmd, terminal, discord, spotify, etc.
You can also open a URL in the browser: open_app({ app: "chrome", url: "https://youtube.com" })
Or open a specific file: open_app({ app: "notepad", file: "C:\\path\\to\\file.txt" })`,

  parameters: z.object({
    app: z.string().describe("App name (e.g. 'notepad', 'chrome', 'vscode') or full executable path"),
    url: z.string().optional().describe("URL to open in browser"),
    file: z.string().optional().describe("File path to open with the app"),
    wait: z.boolean().optional().default(false).describe("Wait for app to close before returning"),
  }),

  execute: async (args: any) => {
    const { app, url, file, wait = false } = args;
    const platform = os.platform();
    const platformKey = platform === "win32" ? "win" : platform === "darwin" ? "mac" : "linux";

    // Cari di map dulu
    const appLower = app.toLowerCase().trim();
    const mapped = Object.entries(APP_MAP).find(([key]) =>
      appLower === key || appLower.includes(key)
    );

    let command: string;

    if (mapped) {
      command = mapped[1][platformKey];
      // Tambahkan URL atau file jika ada
      if (url && (appLower.includes("chrome") || appLower.includes("firefox") || appLower.includes("edge"))) {
        command += ` "${url}"`;
      } else if (file) {
        command += ` "${file}"`;
      }
    } else {
      // Tidak di map — coba langsung sebagai command/path
      command = platform === "win32"
        ? `start "" "${app}"${file ? ` "${file}"` : ""}${url ? ` "${url}"` : ""}`
        : `${app}${file ? ` "${file}"` : ""}${url ? ` "${url}"` : ""}`;
    }

    try {
      const proc = execa(command, {
        shell: true,
        detached: !wait,
        stdio: wait ? "pipe" : "ignore",
        windowsHide: false,
      });

      if (!wait) {
        proc.unref();
        // Tunggu sebentar untuk pastikan tidak langsung crash
        await new Promise(r => setTimeout(r, 800));
        return `✓ Opened: ${app}${url ? ` → ${url}` : ""}${file ? ` → ${file}` : ""}`;
      }

      const result = await proc;
      return result.stdout || `✓ ${app} completed (exit ${result.exitCode})`;
    } catch (e: any) {
      throw new Error(`Failed to open "${app}": ${e.message}`);
    }
  },
};
