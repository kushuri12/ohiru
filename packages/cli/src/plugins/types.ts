// src/plugins/types.ts
// Plugin system type definitions — supports Hiru native, Claude Code, OpenClaw, and generic formats

export type PluginFormat = "hiru" | "claude-code" | "openclaw" | "generic";
export type PluginStatus = "active" | "disabled" | "error" | "installing";

/**
 * Manifest for a Hiru plugin.
 * Can be sourced from package.json, plugin.json, or auto-detected.
 */
export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  format: PluginFormat;
  main?: string;

  /** Tool definitions this plugin provides */
  tools?: Record<string, PluginToolDef>;

  /** Skill files bundled in the plugin */
  skills?: PluginSkillDef[];

  /** Prompt injections (system prompt additions) */
  prompts?: PluginPromptDef[];

  /** Hooks into agent lifecycle */
  hooks?: PluginHooks;

  /** Slash commands this plugin registers */
  commands?: PluginCommandDef[];

  /** Dependencies (npm packages needed) */
  dependencies?: Record<string, string>;
}

export interface PluginToolDef {
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
  /** Path to the handler file (relative to plugin root) */
  handler: string;
  /** Export name in the handler file (default: "execute") */
  exportName?: string;
}

export interface PluginSkillDef {
  name: string;
  description: string;
  /** Entry file relative to plugin root */
  main: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
  tags?: string[];
}

export interface PluginPromptDef {
  /** Where to inject: "system", "identity", "capabilities" */
  position: "system" | "identity" | "capabilities";
  content: string;
  /** Path to a .md file (alternative to inline content) */
  file?: string;
}

export interface PluginHooks {
  onInstall?: string;
  onLoad?: string;
  onUnload?: string;
  onBeforeToolCall?: string;
  onAfterToolCall?: string;
}

export interface PluginCommandDef {
  name: string;
  description: string;
  handler: string;
  /** Export name (default: "execute") */
  exportName?: string;
}

/**
 * A loaded, active plugin instance
 */
export interface LoadedPlugin {
  manifest: PluginManifest;
  dir: string;
  status: PluginStatus;
  source: string; // GitHub URL or local path
  installedAt: string;
  loadedTools: Record<string, any>;
  loadedCommands: Record<string, (args: string[], ctx: any) => Promise<string>>;
  promptInjections: string[];
  error?: string;
}

/**
 * Plugin registry entry (persisted to disk)
 */
export interface PluginRegistryEntry {
  name: string;
  source: string;
  format: PluginFormat;
  status: PluginStatus;
  installedAt: string;
  updatedAt: string;
  version: string;
  description: string;
  dir: string;
}
