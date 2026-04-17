// src/plugins/PluginLoader.ts
// Multi-format plugin loader — detects and normalizes Claude Code, OpenClaw, and generic plugins

import fs from "fs/promises";
import path from "path";
import {
  PluginManifest,
  PluginFormat,
  PluginToolDef,
  PluginSkillDef,
  PluginPromptDef,
  PluginCommandDef,
} from "./types.js";

/**
 * Detects the plugin format and produces a normalized PluginManifest.
 */
export class PluginLoader {
  /**
   * Detect format and load manifest from a plugin directory
   */
  static async loadManifest(pluginDir: string): Promise<PluginManifest> {
    const format = await this.detectFormat(pluginDir);

    switch (format) {
      case "hiru":
        return this.loadHiruManifest(pluginDir);
      case "claude-code":
        return this.loadClaudeCodeManifest(pluginDir);
      case "openclaw":
        return this.loadOpenClawManifest(pluginDir);
      case "generic":
      default:
        return this.loadGenericManifest(pluginDir);
    }
  }

  /**
   * Detect plugin format from directory structure
   */
  static async detectFormat(pluginDir: string): Promise<PluginFormat> {
    const exists = async (p: string) =>
      fs.access(path.join(pluginDir, p)).then(() => true).catch(() => false);

    // 1. Check for Hiru native: plugin.json or package.json with "hiru-plugin" keyword
    if (await exists("plugin.json")) return "hiru";
    if (await exists("package.json")) {
      try {
        const pkg = JSON.parse(await fs.readFile(path.join(pluginDir, "package.json"), "utf8"));
        if (pkg.keywords?.includes("hiru-plugin") || pkg.hiruPlugin) return "hiru";
      } catch {}
    }

    // 2. Check for Claude Code style: .claude/ directory with commands
    if (await exists(".claude")) return "claude-code";
    if (await exists("commands")) {
      const entries = await fs.readdir(path.join(pluginDir, "commands"));
      if (entries.some((e) => e.endsWith(".md") || e.endsWith(".js") || e.endsWith(".ts"))) {
        return "claude-code";
      }
    }

    // 3. Check for OpenClaw style: SOUL.md, IDENTITY.md, or skills/ directory
    if (await exists("SOUL.md") || await exists("IDENTITY.md") || await exists("USER.md")) {
      return "openclaw";
    }

    // 4. Generic: any repo with executable files
    return "generic";
  }

  // ─────────────────────────────────────────────────────────────
  // Hiru Native Format
  // ─────────────────────────────────────────────────────────────

  private static async loadHiruManifest(pluginDir: string): Promise<PluginManifest> {
    const pluginJsonPath = path.join(pluginDir, "plugin.json");
    const pkgJsonPath = path.join(pluginDir, "package.json");

    let raw: any = {};

    if (await fs.access(pluginJsonPath).then(() => true).catch(() => false)) {
      raw = JSON.parse(await fs.readFile(pluginJsonPath, "utf8"));
    } else if (await fs.access(pkgJsonPath).then(() => true).catch(() => false)) {
      const pkg = JSON.parse(await fs.readFile(pkgJsonPath, "utf8"));
      raw = pkg.hiruPlugin || pkg;
    }

    return {
      name: raw.name || path.basename(pluginDir),
      version: raw.version || "1.0.0",
      description: raw.description || "Hiru plugin",
      author: raw.author,
      format: "hiru",
      main: raw.main,
      tools: raw.tools || {},
      skills: raw.skills || [],
      prompts: raw.prompts || [],
      hooks: raw.hooks || {},
      commands: raw.commands || [],
      dependencies: raw.dependencies || {},
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Claude Code Format
  // ─────────────────────────────────────────────────────────────

  private static async loadClaudeCodeManifest(pluginDir: string): Promise<PluginManifest> {
    const commands: PluginCommandDef[] = [];
    const prompts: PluginPromptDef[] = [];
    const tools: Record<string, PluginToolDef> = {};

    // Load commands from .claude/ or commands/ directory
    const commandDirs = [
      path.join(pluginDir, ".claude", "commands"),
      path.join(pluginDir, "commands"),
    ];

    for (const cmdDir of commandDirs) {
      if (!(await fs.access(cmdDir).then(() => true).catch(() => false))) continue;
      await this.scanClaudeCommands(cmdDir, "", commands, tools);
    }

    // Load CLAUDE.md as prompt injection
    const claudeMdPath = path.join(pluginDir, "CLAUDE.md");
    if (await fs.access(claudeMdPath).then(() => true).catch(() => false)) {
      const content = await fs.readFile(claudeMdPath, "utf8");
      prompts.push({ position: "system", content });
    }

    // Load .claude/settings.json if exists
    const settingsPath = path.join(pluginDir, ".claude", "settings.json");
    if (await fs.access(settingsPath).then(() => true).catch(() => false)) {
      try {
        const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
        if (settings.instructions) {
          prompts.push({ position: "identity", content: settings.instructions });
        }
      } catch {}
    }

    // Try to get name from package.json or directory name
    let name = path.basename(pluginDir);
    let version = "1.0.0";
    let description = "Claude Code plugin";
    const pkgPath = path.join(pluginDir, "package.json");
    if (await fs.access(pkgPath).then(() => true).catch(() => false)) {
      try {
        const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));
        name = pkg.name || name;
        version = pkg.version || version;
        description = pkg.description || description;
      } catch {}
    }

    return {
      name, version, description,
      format: "claude-code",
      tools,
      commands,
      prompts,
      skills: [],
      hooks: {},
      dependencies: {},
    };
  }

  /**
   * Recursively scan Claude Code command directories.
   * .md files become prompt-based commands, .js/.ts become executable commands.
   */
  private static async scanClaudeCommands(
    dir: string,
    prefix: string,
    commands: PluginCommandDef[],
    tools: Record<string, PluginToolDef>
  ): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.scanClaudeCommands(fullPath, `${prefix}${entry.name}_`, commands, tools);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      const baseName = path.basename(entry.name, ext);
      const cmdName = `${prefix}${baseName}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();

      if (ext === ".md") {
        // Markdown command → becomes a prompt-injected command
        const content = await fs.readFile(fullPath, "utf8");
        commands.push({
          name: cmdName,
          description: content.split("\n")[0]?.replace(/^#+\s*/, "") || `Command: ${cmdName}`,
          handler: fullPath,
        });
      } else if ([".js", ".mjs", ".ts"].includes(ext)) {
        // Executable command → becomes a tool
        tools[`plugin_${cmdName}`] = {
          description: `[PLUGIN] Command: ${cmdName}`,
          parameters: { input: { type: "string", description: "Input for the command" } },
          handler: fullPath,
        };
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // OpenClaw Format
  // ─────────────────────────────────────────────────────────────

  private static async loadOpenClawManifest(pluginDir: string): Promise<PluginManifest> {
    const prompts: PluginPromptDef[] = [];
    const skills: PluginSkillDef[] = [];

    // Load soul/identity/user markdown files
    const soulFiles: Array<{ file: string; position: "system" | "identity" }> = [
      { file: "SOUL.md", position: "system" },
      { file: "IDENTITY.md", position: "identity" },
      { file: "USER.md", position: "identity" },
    ];

    for (const sf of soulFiles) {
      const filePath = path.join(pluginDir, sf.file);
      if (await fs.access(filePath).then(() => true).catch(() => false)) {
        const content = await fs.readFile(filePath, "utf8");
        prompts.push({ position: sf.position, content, file: sf.file });
      }
    }

    // Scan skills/ directory
    const skillsDir = path.join(pluginDir, "skills");
    if (await fs.access(skillsDir).then(() => true).catch(() => false)) {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillDir = path.join(skillsDir, entry.name);
        const metaPath = path.join(skillDir, `${entry.name}.json`);

        if (await fs.access(metaPath).then(() => true).catch(() => false)) {
          try {
            const meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
            skills.push({
              name: meta.name || entry.name,
              description: meta.description || `Skill: ${entry.name}`,
              main: meta.main || `${entry.name}.mjs`,
              parameters: meta.parameters || {},
              tags: meta.tags || [],
            });
          } catch {}
        }
      }
    }

    // Scan tools/ directory
    const tools: Record<string, PluginToolDef> = {};
    const toolsDir = path.join(pluginDir, "tools");
    if (await fs.access(toolsDir).then(() => true).catch(() => false)) {
      const entries = await fs.readdir(toolsDir);
      for (const file of entries) {
        const ext = path.extname(file).toLowerCase();
        if (![".js", ".mjs", ".ts", ".py"].includes(ext)) continue;
        const toolName = path.basename(file, ext).replace(/[^a-z0-9_]/gi, "_").toLowerCase();
        tools[`plugin_${toolName}`] = {
          description: `[PLUGIN/OpenClaw] Tool: ${toolName}`,
          parameters: { input: { type: "string", description: "Input arguments as JSON" } },
          handler: path.join(toolsDir, file),
        };
      }
    }

    let name = path.basename(pluginDir);
    let version = "1.0.0";
    let description = "OpenClaw plugin";
    const pkgPath = path.join(pluginDir, "package.json");
    if (await fs.access(pkgPath).then(() => true).catch(() => false)) {
      try {
        const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));
        name = pkg.name || name;
        version = pkg.version || version;
        description = pkg.description || description;
      } catch {}
    }

    return {
      name, version, description,
      format: "openclaw",
      tools,
      skills,
      prompts,
      hooks: {},
      commands: [],
      dependencies: {},
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Generic Format (fallback)
  // ─────────────────────────────────────────────────────────────

  private static async loadGenericManifest(pluginDir: string): Promise<PluginManifest> {
    const tools: Record<string, PluginToolDef> = {};
    const prompts: PluginPromptDef[] = [];

    // Scan root for executable files
    const entries = await fs.readdir(pluginDir);
    const executableExts = [".js", ".mjs", ".ts", ".py", ".sh", ".bat", ".ps1"];

    for (const file of entries) {
      const ext = path.extname(file).toLowerCase();
      if (!executableExts.includes(ext)) continue;
      const toolName = path.basename(file, ext).replace(/[^a-z0-9_]/gi, "_").toLowerCase();

      // Skip common non-tool files
      if (["index", "main", "setup", "install", "test", "config"].includes(toolName)) continue;

      tools[`plugin_${toolName}`] = {
        description: `[PLUGIN] ${toolName}`,
        parameters: { input: { type: "string", description: "Input" } },
        handler: path.join(pluginDir, file),
      };
    }

    // Load README as context
    for (const readmeFile of ["README.md", "readme.md", "README.MD"]) {
      const readmePath = path.join(pluginDir, readmeFile);
      if (await fs.access(readmePath).then(() => true).catch(() => false)) {
        const content = await fs.readFile(readmePath, "utf8");
        // Only inject first 2000 chars of README as context
        prompts.push({ position: "capabilities", content: content.slice(0, 2000) });
        break;
      }
    }

    let name = path.basename(pluginDir);
    let version = "1.0.0";
    let description = "Generic plugin";
    const pkgPath = path.join(pluginDir, "package.json");
    if (await fs.access(pkgPath).then(() => true).catch(() => false)) {
      try {
        const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));
        name = pkg.name || name;
        version = pkg.version || version;
        description = pkg.description || description;
      } catch {}
    }

    return {
      name, version, description,
      format: "generic",
      tools,
      skills: [],
      prompts,
      hooks: {},
      commands: [],
      dependencies: {},
    };
  }
}
