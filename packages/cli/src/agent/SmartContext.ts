// packages/cli/src/agent/SmartContext.ts
// ─────────────────────────────────────────────────────────────────────────────
// TOOL KIT SYSTEM (v1.4.0)
// Optimized for 90% token reduction by grouping tools into modular kits.
// ─────────────────────────────────────────────────────────────────────────────

export type ToolKitName = "core" | "web" | "desktop" | "specialist" | "full";

export const TOOL_KITS: Record<string, readonly string[]> = {
  core: [
    "read_file", "write_file", "execute_command", "replace_file_content", 
    "list_files", "list_directory", "manage_memory", "manage_todo", "open_toolkit"
  ],
  web: [
    "search_web", "read_url", "fetch_url"
  ],
  desktop: [
    "take_screenshot", "move_mouse", "click_at", "click", "type_text", "type",
    "press_key", "scroll", "inspect_ui", "get_screen_size", "open_application"
  ],
  specialist: [
    "manage_skills", "manage_plugins", "spawn_agent"
  ]
} as const;

/**
 * Returns tools for a specific set of active kits.
 */
export function getKitTools(
  allTools: Record<string, any>, 
  activeKits: Set<ToolKitName>
): Record<string, any> {
  const filtered: Record<string, any> = {};
  const allowedNames = new Set<string>();

  // If "full" is in active kits, return everything
  if (activeKits.has("full")) return allTools;

  // Add tools from each active kit
  for (const kitName of activeKits) {
    const toolsInKit = TOOL_KITS[kitName];
    if (toolsInKit) {
      for (const name of toolsInKit) allowedNames.add(name);
    }
  }

  // Always include the tool to open other toolkits
  allowedNames.add("open_toolkit");

  for (const [name, tool] of Object.entries(allTools)) {
    if (allowedNames.has(name)) {
      filtered[name] = tool;
    } else if (name.startsWith("skill_") && activeKits.has("specialist")) {
      filtered[name] = tool;
    } else if (name.startsWith("plugin_") && activeKits.has("specialist")) {
      filtered[name] = tool;
    }
  }

  return filtered;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIERED MESSAGE COMPRESSOR
// ─────────────────────────────────────────────────────────────────────────────
export function applyTieredCompression(messages: any[]): any[] {
  const total = messages.length;
  const HOT_ZONE  = 3;   
  const WARM_ZONE = 8;   
  const COLD_ZONE = 20;  

  const WARM_MAX = 800;
  const COLD_MAX = 300;
  const TOOL_WARM_MAX = 400;  
  const TOOL_COLD_MAX = 150;

  return messages.map((msg, idx) => {
    const distFromEnd = total - 1 - idx;
    if (idx < 2) return msg; // Always keep the first 2 messages (Objective)
    if (distFromEnd < HOT_ZONE) return msg; 

    const isToolResult = msg.role === "tool" || msg.role === "tool_result";
    const maxChars = distFromEnd < WARM_ZONE
      ? (isToolResult ? TOOL_WARM_MAX : WARM_MAX)   
      : (isToolResult ? TOOL_COLD_MAX : COLD_MAX);  

    if (typeof msg.content === "string" && msg.content.length > maxChars) {
      return {
        ...msg,
        content: msg.content.slice(0, maxChars) + `...[${msg.content.length - maxChars}c omitted]`,
      };
    }

    if (Array.isArray(msg.content)) {
      const compressed = msg.content.map((block: any) => {
        if (block.type === "text" && typeof block.text === "string" && block.text.length > maxChars) {
          return { ...block, text: block.text.slice(0, maxChars) + `...[omitted]` };
        }
        if (block.type === "tool-result") {
          const c = typeof block.content === "string" ? block.content : JSON.stringify(block.content || "");
          const limit = isToolResult ? TOOL_WARM_MAX : maxChars;
          if (c.length > limit) {
            return { ...block, content: c.slice(0, limit) + `...[omitted]` };
          }
        }
        return block;
      });
      return { ...msg, content: compressed };
    }

    return msg;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL DESCRIPTION TRIMMER
// ─────────────────────────────────────────────────────────────────────────────
export function trimToolDescriptions(tools: Record<string, any>): Record<string, any> {
  const MAX_DESC = 400; 
  const trimmed: Record<string, any> = {};
  
  for (const [name, tool] of Object.entries(tools)) {
    const hasList = /[\n\r]\s*([-*]|\d+\.)\s/.test(tool.description || "");
    if (tool.description && (hasList || tool.description.includes("You can:"))) {
      trimmed[name] = tool;
      continue;
    }

    if (tool.description && tool.description.length > MAX_DESC) {
      trimmed[name] = {
        ...tool,
        description: tool.description.slice(0, MAX_DESC) + "...",
      };
    } else {
      trimmed[name] = tool;
    }
  }
  
  return trimmed;
}

export const MINIMAL_SYSTEM_PROMPT = `You are OpenHiru, an OVERPOWERED Autonomous Coding Agent. Match the user's language. Be concise and professional. Use open_toolkit to access advanced tools if needed.`;
