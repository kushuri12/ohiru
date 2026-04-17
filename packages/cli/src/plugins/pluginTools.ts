// src/plugins/pluginTools.ts
// AI-accessible tools for managing plugins at runtime

import { z } from "zod";
import { PluginManager } from "./PluginManager.js";

/**
 * Creates tools that the AI can use to manage plugins.
 */
export function createPluginTools(pluginManager: PluginManager) {
  return {
    manage_plugins: {
      description: `Manage Hiru plugins. Actions: list, install, uninstall, update, enable, disable, info, reload.

PLUGINS extend Hiru with new tools, skills, commands, and prompt injections.
Plugins can come from:
- GitHub repos: "user/repo" or "https://github.com/user/repo"
- Local paths: "/absolute/path/to/plugin"

Supported plugin formats (auto-detected):
- **Hiru native**: Has plugin.json or "hiru-plugin" keyword in package.json
- **Claude Code style**: Has .claude/ directory with commands, CLAUDE.md
- **OpenClaw style**: Has SOUL.md, IDENTITY.md, skills/ directory
- **Generic**: Any repo with executable scripts

Plugins are hot-loaded — no restart required!
After install, call 'info' to verify tools loaded correctly.`,

      parameters: z.object({
        action: z.enum(["list", "install", "uninstall", "update", "enable", "disable", "info", "reload"])
          .describe("What to do. 'reload' re-loads an already-installed plugin from disk without reinstalling."),
        source: z.string().optional()
          .describe("GitHub URL or local path (for install/update). Plugin name (for uninstall/enable/disable/info/reload). Examples: 'user/repo', 'https://github.com/user/repo', '/local/path'"),
      }),

      execute: async (args: any) => {
        const { action, source } = args;

        switch (action) {
          case "list": {
            const plugins = pluginManager.listPlugins();
            if (plugins.length === 0) {
              return "No plugins installed. Use action 'install' with a GitHub URL or local path.";
            }
            const list = plugins.map(p => {
              const statusEmoji = p.status === "active" ? "✅" : p.status === "disabled" ? "⏸️" : "❌";
              const plugin = pluginManager.getPlugin(p.name);
              const toolCount = plugin ? Object.keys(plugin.loadedTools).length : "?";
              return `${statusEmoji} **${p.name}** v${p.version} [${p.format}] — ${p.description}\n   Tools: ${toolCount} | Source: ${p.source}`;
            }).join("\n");
            return `Installed plugins (${plugins.length}):\n${list}`;
          }

          case "install": {
            if (!source) return "Error: 'install' requires a source (GitHub URL or local path).";
            const result = await pluginManager.install(source);
            if (result.success) {
              const plugin = pluginManager.getPlugin(result.name!);
              const toolCount = plugin ? Object.keys(plugin.loadedTools).length : 0;
              const cmdCount = plugin ? Object.keys(plugin.loadedCommands).length : 0;
              return [
                `✅ Plugin "${result.name}" installed successfully!`,
                `🔧 Tools loaded: ${toolCount}`,
                `⌨️ Commands loaded: ${cmdCount}`,
                toolCount === 0 && cmdCount === 0
                  ? `⚠️ No tools or commands were loaded. Use action 'info' to debug.`
                  : `All capabilities are now available immediately.`,
              ].filter(Boolean).join("\n");
            }
            return `❌ Failed to install plugin: ${result.error}`;
          }

          case "uninstall": {
            if (!source) return "Error: 'uninstall' requires a plugin name.";
            const result = await pluginManager.uninstall(source);
            if (result.success) {
              return `🗑️ Plugin "${source}" uninstalled and all its tools removed.`;
            }
            return `❌ Failed to uninstall: ${result.error}`;
          }

          case "update": {
            if (!source) return "Error: 'update' requires a plugin name.";
            const result = await pluginManager.update(source);
            if (result.success) {
              return `🔄 Plugin "${source}" updated successfully! New tools are immediately available.`;
            }
            return `❌ Failed to update: ${result.error}`;
          }

          case "enable": {
            if (!source) return "Error: 'enable' requires a plugin name.";
            const ok = await pluginManager.enable(source);
            return ok ? `✅ Plugin "${source}" enabled. Its tools are now available.` : `❌ Plugin "${source}" not found.`;
          }

          case "disable": {
            if (!source) return "Error: 'disable' requires a plugin name.";
            const ok = await pluginManager.disable(source);
            return ok ? `⏸️ Plugin "${source}" disabled. Its tools have been removed.` : `❌ Plugin "${source}" not found.`;
          }

          case "reload": {
            if (!source) return "Error: 'reload' requires a plugin name.";
            const ok = await pluginManager.reload(source);
            if (ok) {
              const plugin = pluginManager.getPlugin(source);
              const toolCount = plugin ? Object.keys(plugin.loadedTools).length : 0;
              return `🔄 Plugin "${source}" reloaded from disk. Tools loaded: ${toolCount}`;
            }
            return `❌ Plugin "${source}" not found. Use 'info' to check available plugins.`;
          }

          case "info": {
            if (!source) return "Error: 'info' requires a plugin name.";
            const plugin = pluginManager.getPlugin(source);
            if (!plugin) {
              // Maybe installed but not loaded — check registry
              const registered = pluginManager.listPlugins().find(p => p.name === source);
              if (registered) {
                return `Plugin "${source}" is registered (status: ${registered.status}) but NOT loaded in memory.\nTry: action 'reload', source '${source}'`;
              }
              return `Plugin "${source}" not found. Use action 'list' to see installed plugins.`;
            }
            
            const m = plugin.manifest;
            const toolNames = Object.keys(plugin.loadedTools);
            const cmdNames = Object.keys(plugin.loadedCommands);
            const skillCount = m.skills?.length || 0;

            return [
              `📦 **${m.name}** v${m.version}`,
              `📝 ${m.description}`,
              `🏷️ Format: ${m.format}`,
              `📂 Dir: ${plugin.dir}`,
              `🔗 Source: ${plugin.source}`,
              `📊 Status: ${plugin.status}`,
              ``,
              `**Loaded Resources:**`,
              `  🔧 Tools (${toolNames.length}): ${toolNames.length > 0 ? toolNames.join(", ") : "none"}`,
              `  ⌨️ Commands (${cmdNames.length}): ${cmdNames.length > 0 ? cmdNames.join(", ") : "none"}`,
              `  💉 Prompt Injections: ${plugin.promptInjections.length}`,
              `  🎯 Skills defined in manifest: ${skillCount}`,
              toolNames.length === 0 ? `\n⚠️ No tools loaded! Check that handler files exist and are valid JS/TS/Python.` : "",
            ].filter(l => l !== undefined).join("\n");
          }

          default:
            return `Unknown action: ${action}. Use: list, install, uninstall, update, enable, disable, info, reload.`;
        }
      },
    },
  };
}
