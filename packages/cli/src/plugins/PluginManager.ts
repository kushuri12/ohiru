// src/plugins/PluginManager.ts
// Core plugin engine — install from GitHub, hot-load, multi-format support

import fs from "fs-extra";
import path from "path";
import os from "os";
import { EventEmitter } from "events";
import { execa } from "execa";
import { z } from "zod";
import {
  PluginManifest,
  PluginRegistryEntry,
  LoadedPlugin,
  PluginStatus,
  PluginToolDef,
} from "./types.js";
import { PluginLoader } from "./PluginLoader.js";

// ─────────────────────────────────────────────────────────────
// Runtime map for external executors (same as SkillManager)
// ─────────────────────────────────────────────────────────────

const RUNTIME_MAP: Record<string, string | null> = {
  ".mjs": null, ".js": null, ".cjs": null,
  ".py": "python", ".ts": "npx tsx",
  ".sh": "bash", ".bat": "cmd /c",
  ".ps1": "powershell -ExecutionPolicy Bypass -File",
  ".rb": "ruby", ".php": "php",
};

export class PluginManager extends EventEmitter {
  private pluginsDir: string;
  private registryPath: string;
  private registry: Map<string, PluginRegistryEntry> = new Map();
  private loaded: Map<string, LoadedPlugin> = new Map();

  constructor(customDir?: string) {
    super();
    this.pluginsDir = customDir || path.join(os.homedir(), ".hiru", "plugins");
    this.registryPath = path.join(this.pluginsDir, "_registry.json");
  }

  get dir(): string {
    return this.pluginsDir;
  }

  // ─────────────────────────────────────────────────────────────
  // Initialization
  // ─────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    await fs.mkdir(this.pluginsDir, { recursive: true });
    await this.loadRegistry();
    await this.loadAllPlugins();
  }

  private async loadRegistry(): Promise<void> {
    try {
      const raw = await fs.readFile(this.registryPath, "utf8");
      const entries: PluginRegistryEntry[] = JSON.parse(raw);
      this.registry.clear();
      for (const entry of entries) {
        this.registry.set(entry.name, entry);
      }
    } catch {
      // No registry yet — fresh install
    }
  }

  private async saveRegistry(): Promise<void> {
    const entries = Array.from(this.registry.values());
    await fs.writeFile(this.registryPath, JSON.stringify(entries, null, 2), "utf8");
  }

  // ─────────────────────────────────────────────────────────────
  // Install from GitHub (or local path)
  // ─────────────────────────────────────────────────────────────

  /**
   * Install a plugin from a GitHub URL or local path.
   * Supports:
   *   - https://github.com/user/repo
   *   - github.com/user/repo
   *   - user/repo (shorthand)
   *   - /absolute/local/path
   */
  async install(source: string): Promise<{ success: boolean; name?: string; error?: string }> {
    const normalizedSource = this.normalizeSource(source);
    const isLocal = !normalizedSource.includes("github.com") && !normalizedSource.includes("/") || 
                     (normalizedSource.startsWith("/") || normalizedSource.startsWith("\\") || /^[A-Z]:\\/i.test(normalizedSource));

    let pluginDir: string;
    let repoName: string;

    if (isLocal && (normalizedSource.startsWith("/") || normalizedSource.startsWith("\\") || /^[A-Z]:\\/i.test(normalizedSource))) {
      // Local path — symlink or copy
      repoName = path.basename(normalizedSource);
      pluginDir = path.join(this.pluginsDir, repoName);

      if (await this.exists(pluginDir)) {
        await fs.rm(pluginDir, { recursive: true, force: true });
      }

      // Copy the directory
      await this.copyDir(normalizedSource, pluginDir);
    } else {
      // GitHub URL — clone
      const gitUrl = this.toGitUrl(normalizedSource);
      repoName = this.extractRepoName(normalizedSource);
      pluginDir = path.join(this.pluginsDir, repoName);

      this.emit("status", `📦 Cloning ${repoName}...`);

      if (await this.exists(pluginDir)) {
        // Update existing — git pull
        try {
          await execa("git", ["pull", "--ff-only"], { cwd: pluginDir, timeout: 60000 });
          this.emit("status", `📦 Updated ${repoName}`);
        } catch {
          // Force re-clone
          await fs.rm(pluginDir, { recursive: true, force: true });
          await execa("git", ["clone", "--depth", "1", gitUrl, pluginDir], { timeout: 120000 });
        }
      } else {
        try {
          await execa("git", ["clone", "--depth", "1", gitUrl, pluginDir], { timeout: 120000 });
        } catch (e: any) {
          return { success: false, error: `Failed to clone: ${e.message}` };
        }
      }
    }

    // Detect format and load manifest
    this.emit("status", `🔍 Detecting plugin format...`);
    let manifest: PluginManifest;
    try {
      manifest = await PluginLoader.loadManifest(pluginDir);
    } catch (e: any) {
      await fs.rm(pluginDir, { recursive: true, force: true }).catch(() => {});
      return { success: false, error: `Failed to parse plugin: ${e.message}` };
    }

    // Install npm dependencies if package.json exists
    const pkgPath = path.join(pluginDir, "package.json");
    if (await this.exists(pkgPath)) {
      this.emit("status", `📦 Installing dependencies for ${manifest.name}...`);
      try {
        await execa("npm", ["install", "--production", "--no-audit", "--no-fund", "--legacy-peer-deps"], {
          cwd: pluginDir,
          timeout: 120000,
          shell: true,
        });
      } catch (e: any) {
        this.emit("status", `⚠️ npm install warning: ${e.message}`);
        // Non-fatal — continue
      }
    }

    // Run onInstall hook
    if (manifest.hooks?.onInstall) {
      try {
        const hookPath = path.join(pluginDir, manifest.hooks.onInstall);
        await execa("node", [hookPath], { cwd: pluginDir, timeout: 30000 });
      } catch (e: any) {
        this.emit("status", `⚠️ onInstall hook failed: ${e.message}`);
      }
    }

    // Save to registry
    const entry: PluginRegistryEntry = {
      name: manifest.name,
      source: normalizedSource,
      format: manifest.format,
      status: "active",
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: manifest.version,
      description: manifest.description,
      dir: pluginDir,
    };

    this.registry.set(manifest.name, entry);
    await this.saveRegistry();

    // Hot-load the plugin
    try {
      await this.loadPlugin(manifest.name, pluginDir, manifest, normalizedSource);
      this.emit("pluginInstalled", manifest.name, manifest);
      this.emit("status", `✅ Plugin "${manifest.name}" installed (${manifest.format} format)`);
      return { success: true, name: manifest.name };
    } catch (e: any) {
      return { success: false, name: manifest.name, error: `Installed but failed to load: ${e.message}` };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Uninstall
  // ─────────────────────────────────────────────────────────────

  async uninstall(name: string): Promise<{ success: boolean; error?: string }> {
    const entry = this.registry.get(name);
    if (!entry) return { success: false, error: `Plugin "${name}" not found` };

    // Run onUnload hook
    const loaded = this.loaded.get(name);
    if (loaded?.manifest.hooks?.onUnload) {
      try {
        const hookPath = path.join(entry.dir, loaded.manifest.hooks.onUnload);
        await execa("node", [hookPath], { cwd: entry.dir, timeout: 10000 });
      } catch {}
    }

    // Remove from loaded
    this.loaded.delete(name);

    // Remove directory
    await fs.rm(entry.dir, { recursive: true, force: true }).catch(() => {});

    // Remove from registry
    this.registry.delete(name);
    await this.saveRegistry();

    this.emit("pluginUninstalled", name);
    return { success: true };
  }

  // ─────────────────────────────────────────────────────────────
  // Enable / Disable
  // ─────────────────────────────────────────────────────────────

  async enable(name: string): Promise<boolean> {
    const entry = this.registry.get(name);
    if (!entry) return false;

    entry.status = "active";
    entry.updatedAt = new Date().toISOString();
    await this.saveRegistry();

    // Hot-load
    try {
      const manifest = await PluginLoader.loadManifest(entry.dir);
      await this.loadPlugin(name, entry.dir, manifest, entry.source);
    } catch {}

    this.emit("pluginEnabled", name);
    return true;
  }

  async disable(name: string): Promise<boolean> {
    const entry = this.registry.get(name);
    if (!entry) return false;

    entry.status = "disabled";
    entry.updatedAt = new Date().toISOString();
    await this.saveRegistry();

    this.loaded.delete(name);
    this.emit("pluginDisabled", name);
    return true;
  }

  // ─────────────────────────────────────────────────────────────
  // Update
  // ─────────────────────────────────────────────────────────────

  async update(name: string): Promise<{ success: boolean; error?: string }> {
    const entry = this.registry.get(name);
    if (!entry) return { success: false, error: `Plugin "${name}" not found` };

    // Re-install from source
    return this.install(entry.source);
  }

  /**
   * Reload a loaded plugin from disk (without reinstalling).
   * Useful after manually editing plugin files.
   */
  async reload(name: string): Promise<boolean> {
    const entry = this.registry.get(name);
    if (!entry) return false;

    try {
      // Remove current loaded state
      this.loaded.delete(name);

      // Re-detect format and reload manifest
      const manifest = await PluginLoader.loadManifest(entry.dir);
      await this.loadPlugin(name, entry.dir, manifest, entry.source);
      this.emit("pluginEnabled", name); // Trigger tool re-registration
      return true;
    } catch (e: any) {
      console.error(`  ⚠️ Failed to reload plugin "${name}": ${e.message}`);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Loading
  // ─────────────────────────────────────────────────────────────

  private async loadAllPlugins(): Promise<void> {
    for (const [name, entry] of this.registry) {
      if (entry.status !== "active") continue;

      try {
        const manifest = await PluginLoader.loadManifest(entry.dir);
        await this.loadPlugin(name, entry.dir, manifest, entry.source);
      } catch (e: any) {
        entry.status = "error";
        console.error(`  ⚠️ Failed to load plugin "${name}": ${e.message}`);
      }
    }

    if (this.loaded.size > 0) {
      this.emit("loaded", this.loaded.size);
    }
  }

  private async loadPlugin(
    name: string,
    pluginDir: string,
    manifest: PluginManifest,
    source: string
  ): Promise<void> {
    const loadedTools: Record<string, any> = {};
    const loadedCommands: Record<string, (args: string[], ctx: any) => Promise<string>> = {};
    const promptInjections: string[] = [];

    // 1. Load tools — prefix with plugin name to avoid collision
    if (manifest.tools) {
      for (const [toolName, toolDef] of Object.entries(manifest.tools)) {
        try {
          // Validate handler path exists before loading
          const handlerPath = path.isAbsolute(toolDef.handler)
            ? toolDef.handler
            : path.join(pluginDir, toolDef.handler);
          if (!await this.exists(handlerPath)) {
            console.error(`  ⚠️ Plugin "${name}" tool "${toolName}": handler not found at ${handlerPath}`);
            continue;
          }
          const tool = await this.createToolFromDef(toolName, toolDef, pluginDir);
          if (tool) {
            // Use plugin-namespaced key to prevent collisions: plugin_<pluginname>_<toolname>
            const safeToolName = toolName.startsWith("plugin_") ? toolName : `plugin_${toolName}`;
            loadedTools[safeToolName] = tool;
          }
        } catch (e: any) {
          console.error(`  ⚠️ Plugin "${name}" tool "${toolName}" failed: ${e.message}`);
        }
      }
    }

    // 2. Load commands
    if (manifest.commands) {
      for (const cmd of manifest.commands) {
        try {
          loadedCommands[cmd.name] = await this.createCommandHandler(cmd, pluginDir);
        } catch (e: any) {
          console.error(`  ⚠️ Plugin "${name}" command "${cmd.name}" failed: ${e.message}`);
        }
      }
    }

    // 3. Collect prompt injections
    if (manifest.prompts) {
      for (const prompt of manifest.prompts) {
        let content = prompt.content || "";
        if (prompt.file && !content) {
          try {
            content = await fs.readFile(path.join(pluginDir, prompt.file), "utf8");
          } catch {}
        }
        if (content) promptInjections.push(content);
      }
    }

    const loaded: LoadedPlugin = {
      manifest,
      dir: pluginDir,
      status: "active",
      source,
      installedAt: new Date().toISOString(),
      loadedTools,
      loadedCommands,
      promptInjections,
    };

    this.loaded.set(name, loaded);
  }

  // ─────────────────────────────────────────────────────────────
  // Tool creation from plugin definitions
  // ─────────────────────────────────────────────────────────────

  private async createToolFromDef(
    toolName: string,
    toolDef: PluginToolDef,
    pluginDir: string
  ): Promise<any> {
    const handlerPath = path.isAbsolute(toolDef.handler)
      ? toolDef.handler
      : path.join(pluginDir, toolDef.handler);

    const ext = path.extname(handlerPath).toLowerCase();
    const runtime = RUNTIME_MAP[ext];

    // Build zod schema
    const zodShape: Record<string, any> = {};
    for (const [paramName, paramDef] of Object.entries(toolDef.parameters || {})) {
      let zodType: any;
      switch (paramDef.type) {
        case "number": zodType = z.number(); break;
        case "boolean": zodType = z.boolean(); break;
        case "array": zodType = z.array(z.string()); break;
        default: zodType = z.string(); break;
      }
      zodType = zodType.describe(paramDef.description);
      if (!paramDef.required) zodType = zodType.optional();
      zodShape[paramName] = zodType;
    }

    let execute: (args: any) => Promise<string>;

    if (runtime === null) {
      // Native JS import
      const fileUrl = `file:///${handlerPath.replace(/\\/g, "/")}`;
      const mod = await import(/* @vite-ignore */ fileUrl);
      const fn = mod[toolDef.exportName || "execute"] || mod.default;
      if (typeof fn !== "function") {
        throw new Error(`Plugin tool "${toolName}" handler has no executable export`);
      }
      execute = fn;
    } else if (runtime === undefined) {
      throw new Error(`Unsupported file extension: ${ext}`);
    } else {
      // External runtime
      execute = async (args: any): Promise<string> => {
        const argsJson = JSON.stringify(args);
        const result = await execa(`${runtime} "${handlerPath}"`, {
          shell: true,
          cwd: pluginDir,
          timeout: 30000,
          reject: false,
          input: argsJson,
          env: { ...process.env, PLUGIN_ARGS: argsJson },
        });
        if (result.exitCode !== 0) {
          throw new Error(`Plugin tool "${toolName}" failed: ${result.stderr || "unknown error"}`);
        }
        return (result.stdout || "").trim() || "(no output)";
      };
    }

    return {
      description: toolDef.description,
      parameters: z.object(zodShape),
      execute,
    };
  }

  private async createCommandHandler(
    cmd: any,
    pluginDir: string
  ): Promise<(args: string[], ctx: any) => Promise<string>> {
    const handlerPath = path.isAbsolute(cmd.handler)
      ? cmd.handler
      : path.join(pluginDir, cmd.handler);

    const ext = path.extname(handlerPath).toLowerCase();

    if (ext === ".md") {
      // Markdown command — return content as prompt injection
      return async () => {
        const content = await fs.readFile(handlerPath, "utf8");
        return content;
      };
    }

    // Executable command
    const runtime = RUNTIME_MAP[ext];
    if (runtime === null) {
      return async (args: string[]) => {
        const fileUrl = `file:///${handlerPath.replace(/\\/g, "/")}`;
        const mod = await import(/* @vite-ignore */ fileUrl);
        const fn = mod[cmd.exportName || "execute"] || mod.default;
        if (typeof fn !== "function") throw new Error("No executable export");
        return fn(args);
      };
    }

    return async (args: string[]) => {
      const result = await execa(`${runtime || "node"} "${handlerPath}" ${args.join(" ")}`, {
        shell: true,
        cwd: pluginDir,
        timeout: 30000,
        reject: false,
      });
      return result.stdout || result.stderr || "(no output)";
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────

  /** List all registered plugins */
  listPlugins(): PluginRegistryEntry[] {
    return Array.from(this.registry.values());
  }

  /** Get all tools from all active plugins */
  getToolDefinitions(): Record<string, any> {
    const tools: Record<string, any> = {};
    for (const [, plugin] of this.loaded) {
      if (plugin.status !== "active") continue;
      Object.assign(tools, plugin.loadedTools);
    }
    return tools;
  }

  /** Get all prompt injections from active plugins */
  getPromptInjections(): string[] {
    const injections: string[] = [];
    for (const [, plugin] of this.loaded) {
      if (plugin.status !== "active") continue;
      injections.push(...plugin.promptInjections);
    }
    return injections;
  }

  /** Get all slash commands from active plugins */
  getCommands(): Record<string, (args: string[], ctx: any) => Promise<string>> {
    const commands: Record<string, any> = {};
    for (const [, plugin] of this.loaded) {
      if (plugin.status !== "active") continue;
      Object.assign(commands, plugin.loadedCommands);
    }
    return commands;
  }

  /** Get skills definitions from active plugins (for SkillManager integration) */
  getPluginSkills(): Array<{ pluginName: string; skill: any; pluginDir: string }> {
    const skills: Array<{ pluginName: string; skill: any; pluginDir: string }> = [];
    for (const [name, plugin] of this.loaded) {
      if (plugin.status !== "active") continue;
      for (const skill of plugin.manifest.skills || []) {
        skills.push({ pluginName: name, skill, pluginDir: plugin.dir });
      }
    }
    return skills;
  }

  /** Get a specific loaded plugin */
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.loaded.get(name);
  }

  /** Check if a plugin is installed */
  isInstalled(name: string): boolean {
    return this.registry.has(name);
  }

  // ─────────────────────────────────────────────────────────────
  // Utility helpers
  // ─────────────────────────────────────────────────────────────

  private normalizeSource(source: string): string {
    let s = source.trim();
    // Remove trailing .git
    s = s.replace(/\.git$/, "");
    // Remove trailing slashes
    s = s.replace(/\/+$/, "");
    return s;
  }

  private toGitUrl(source: string): string {
    let s = this.normalizeSource(source);
    if (s.startsWith("https://") || s.startsWith("git@")) return s + ".git";
    if (s.startsWith("github.com/")) return `https://${s}.git`;
    // Shorthand: user/repo
    if (s.match(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/)) return `https://github.com/${s}.git`;
    return s;
  }

  private extractRepoName(source: string): string {
    const s = this.normalizeSource(source);
    const parts = s.split("/");
    return parts[parts.length - 1] || "unknown-plugin";
  }

  private async exists(p: string): Promise<boolean> {
    return fs.access(p).then(() => true).catch(() => false);
  }

  private async copyDir(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      if (entry.isDirectory()) {
        await this.copyDir(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}
