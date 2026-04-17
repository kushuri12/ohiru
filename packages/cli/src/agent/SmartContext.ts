// packages/cli/src/agent/SmartContext.ts
// ─────────────────────────────────────────────────────────────────────────────
// SMART TOKEN BUDGET SYSTEM
// Strategy for 80-90% token reduction:
//
// 1. TASK CLASSIFICATION       → select only relevant tools (biggest win)
// 2. TIERED HISTORY            → hot/warm/cold compression per message age
// 3. MINIMAL SYSTEM PROMPT     → ultra-compact prompt for simple queries  
// 4. TOOL DEFINITION TRIMMING  → shorten tool descriptions at runtime
// 5. DEFERRED CONTEXT          → don't inject project context if not needed
// ─────────────────────────────────────────────────────────────────────────────

export type TaskCategory =
  | "chat"      // conversational, general questions — minimal tools
  | "web"       // search, lookup, fetch URL — only web tools
  | "file"      // read/write/list/delete files — only file tools
  | "shell"     // run commands, npm, git — file + shell tools
  | "code"      // coding tasks (edit code, fix bugs) — file + shell + web
  | "desktop"   // screenshot, click, mouse, window — desktop tools
  | "skill"     // manage skills — skill + file + shell tools
  | "plugin"    // manage plugins — plugin + file tools
  | "memory"    // manage memory — memory tools only
  | "full";     // complex/unknown — all tools (fallback)

// ─────────────────────────────────────────────────────────────────────────────
// TOOL GROUPS — maps logical categories to tool name keywords
// ─────────────────────────────────────────────────────────────────────────────
const TOOL_GROUPS: Record<string, readonly string[]> = {
  web:     ["search_web", "read_url", "fetch_url"],
  file:    ["read_file", "write_file", "list_directory", "list_files", "delete_file",
            "copy_file", "move_file", "create_directory", "file_exists", "get_file_info",
            "edit_file", "create_file", "search_in_file", "search_files"],
  shell:   ["execute_command", "run_shell", "run_command", "run_tests", "git_operation"],
  memory:  ["manage_memory"],
  skill:   ["manage_skills"],
  plugin:  ["manage_plugins"],
  todo:    ["manage_todo"],
  desktop: ["take_screenshot", "move_mouse", "click_at", "click", "type_text", "type",
            "press_key", "scroll", "inspect_ui", "get_screen_size", "open_application",
            "drag_mouse", "double_click", "right_click", "get_clipboard"],
  agent:   ["spawn_agent"],
} as const;

// Which tool groups to enable per category
const CATEGORY_TOOLS: Record<TaskCategory, string[]> = {
  chat:    ["web"],                                   // ~2 tools
  web:     ["web"],                                   // ~2 tools
  file:    ["file"],                                  // ~10 tools
  shell:   ["shell", "file"],                         // ~15 tools
  code:    ["file", "shell", "web", "todo"],          // ~18 tools
  desktop: ["desktop", "file", "shell"],              // ~15 tools
  skill:   ["skill", "file", "shell", "todo"],        // ~13 tools
  plugin:  ["plugin", "file", "shell"],               // ~13 tools
  memory:  ["memory"],                                // ~1 tool
  full:    Object.keys(TOOL_GROUPS) as string[],                  // ALL
};

// ─────────────────────────────────────────────────────────────────────────────
// TASK CLASSIFIER
// Detects what the user wants to do from their message.
// Uses keyword matching with priority ordering.
// ─────────────────────────────────────────────────────────────────────────────
export function classifyTask(input: string): TaskCategory {
  if (!input || typeof input !== "string") return "full";
  const lower = input.toLowerCase().trim();

  // Desktop automation (highest priority — very specific keywords)
  if (/\b(screenshot|click|klik|mouse|ketik ke|type into|press key|tekan tombol|scroll|buka app|open app|minimize|maximize|taskbar|desktop automation|inspect ui|screen coords)\b/i.test(lower)) {
    return "desktop";
  }

  // Plugin management
  if (/\b(plugin|install plugin|uninstall plugin|manage plugin|pasang plugin|hapus plugin)\b/i.test(lower)) {
    return "plugin";
  }

  // Skill management
  if (/\b(skill|create skill|bikin skill|tambah skill|manage skill|hapus skill|test skill)\b/i.test(lower)) {
    return "skill";
  }

  // Memory management
  if (/\b(memory|ingat|remember|forget|hapus ingatan|recall|memori|catat)\b/i.test(lower) &&
      !/\b(memori usage|memory leak|out of memory)\b/i.test(lower)) {
    return "memory";
  }

  // Web/search only (no file/code action words)
  if (/^(cari|search|google|carikan|find|cek berita|lihat berita|browsing|browsing|fetch url|buka url|berita|news|harga|informasi tentang|info about|apa itu|what is|siapa itu|who is)\b/i.test(lower) &&
      !/\b(file|kode|code|script|folder|edit|tulis|write|npm|git|fix|perbaiki)\b/i.test(lower)) {
    return "web";
  }

  // Shell/command execution
  if (/\b(run|jalanin|execute|npm|yarn|pip|git |terminal|bash|powershell|cmd|build|deploy|test|install package|docker|make|compile|start server|stop server)\b/i.test(lower) &&
      !/\b(tulis|write|buat file|create file)\b/i.test(lower)) {
    return "shell";
  }

  // File operations only (no code manipulation)
  if (/\b(baca file|read file|tulis file|write file|hapus file|delete file|rename file|copy file|move file|ls |dir |list files|ls$|find file|cari file)\b/i.test(lower)) {
    return "file";
  }

  // Code editing (combined file + shell + web)
  if (/\b(edit|ubah|ganti|refactor|fix|perbaiki|tambahkan kode|hapus kode|buat file|create file|update kode|bikin fitur|implement|debug|error di|bug di|tambah fungsi|bikin class|ekstensi|tambah method)\b/i.test(lower)) {
    return "code";
  }

  // Conversational detection (short + no action words)
  const wordCount = lower.split(/\s+/).length;
  const hasActionWord = /\b(buat|create|edit|run|install|deploy|fix|search|cari|hapus|delete|jalanin|execute|bikin|tulis|write|ubah|ganti|refactor|implement)\b/i.test(lower);
  const isQuestion = /\?$|^(apa|siapa|kapan|dimana|gimana|bagaimana|berapa|kenapa|mengapa|apakah|boleh|bisa|how|what|who|when|where|why|tell me|explain|is there|are you)/.test(lower);
  
  if (!hasActionWord && (isQuestion || wordCount <= 10)) {
    return "chat";
  }

  // Default: use all tools for complex/unknown tasks
  return "full";
}

// ─────────────────────────────────────────────────────────────────────────────
// SMART TOOL SELECTOR
// Filters the full tool map to only include tools relevant to the task.
// This is the #1 token saver — tool definitions can be 4000-6000 tokens total.
// Selecting only 5-8 tools cuts this to ~500-1200 tokens.
// ─────────────────────────────────────────────────────────────────────────────
export function selectTools(
  allTools: Record<string, any>,
  category: TaskCategory
): Record<string, any> {
  // Always use all tools for full/complex tasks
  if (category === "full") return allTools;

  const groupKeys = CATEGORY_TOOLS[category];
  const allowedNames = new Set<string>();

  for (const groupKey of groupKeys) {
    const group = TOOL_GROUPS[groupKey];
    if (group) {
      for (const name of group) allowedNames.add(name);
    }
  }

  // Always keep these meta-tools regardless of category
  allowedNames.add("manage_memory");  // Memory is always useful
  allowedNames.add("manage_todo");    // Todo tracker is always useful

  const filtered: Record<string, any> = {};
  for (const [name, tool] of Object.entries(allTools)) {
    // Direct match
    if (allowedNames.has(name)) {
      filtered[name] = tool;
      continue;
    }
    // Plugin-prefixed tools: always include in non-full categories
    if (name.startsWith("plugin_")) {
      if (allowedNames.has(name.slice(7))) {
        filtered[name] = tool;
      }
      continue;
    }
    // Skill tools: always include (they are task-specific by nature)
    if (name.startsWith("skill_")) {
      filtered[name] = tool;
    }
  }

  return filtered;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIERED MESSAGE COMPRESSOR
// Old messages get compressed more aggressively based on their age.
//
// HOT   (last 3 messages): Full content — untouched
// WARM  (4-8 messages ago): Truncated to 800 chars
// COLD  (9+ messages ago): Truncated to 200 chars
//
// Tool results are treated more aggressively since they are often very large.
// ─────────────────────────────────────────────────────────────────────────────
export function applyTieredCompression(messages: any[]): any[] {
  const total = messages.length;
  const HOT_ZONE  = 3;   // last N messages: untouched
  const WARM_ZONE = 8;   // 4-8 from end: truncate to 800 chars
  const COLD_ZONE = 9;   // 9+ from end: truncate to 200 chars

  const WARM_MAX = 800;
  const COLD_MAX = 200;
  const TOOL_WARM_MAX = 300;  // Tool results compress even harder
  const TOOL_COLD_MAX = 100;

  return messages.map((msg, idx) => {
    const distFromEnd = total - 1 - idx;
    if (distFromEnd < HOT_ZONE) return msg; // HOT: untouched

    const isToolResult = msg.role === "tool" || msg.role === "tool_result";
    const maxChars = distFromEnd < WARM_ZONE
      ? (isToolResult ? TOOL_WARM_MAX : WARM_MAX)   // WARM
      : (isToolResult ? TOOL_COLD_MAX : COLD_MAX);  // COLD

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
// Shortens tool descriptions to their first sentence only.
// Tool descriptions in AI SDK can be 200-500 chars each.
// By trimming to 80 chars, we save ~120-420 chars per tool × 30 tools = ~10k chars.
// ─────────────────────────────────────────────────────────────────────────────
export function trimToolDescriptions(tools: Record<string, any>): Record<string, any> {
  const MAX_DESC = 80; // Max chars for tool description
  const trimmed: Record<string, any> = {};
  
  for (const [name, tool] of Object.entries(tools)) {
    if (tool.description && tool.description.length > MAX_DESC) {
      // Keep only first sentence (up to first period, newline, or max chars)
      const firstSentence = tool.description.split(/[.\n]/)[0].trim();
      trimmed[name] = {
        ...tool,
        description: firstSentence.length > MAX_DESC
          ? firstSentence.slice(0, MAX_DESC) + "…"
          : firstSentence,
      };
    } else {
      trimmed[name] = tool;
    }
  }
  
  return trimmed;
}

// ─────────────────────────────────────────────────────────────────────────────
// ULTRA-MINIMAL SYSTEM PROMPT (for chat/web tasks)
// When the task is a simple question or web search, we don't need the full
// planning/execution/anti-hallucination scaffold. Use a ~100-token prompt instead.
// ─────────────────────────────────────────────────────────────────────────────
export const MINIMAL_SYSTEM_PROMPT = `You are Hiru, a helpful assistant. Be concise. Use search_web for facts. Don't invent information. Match the user's language (Indonesian or English).`;

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN ESTIMATOR
// Rough but fast estimation: 1 token ≈ 4 chars (English), 3 chars (Indonesian)
// ─────────────────────────────────────────────────────────────────────────────
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT BUDGET REPORT (for debugging/monitoring)
// ─────────────────────────────────────────────────────────────────────────────
export function reportBudget(
  systemPromptTokens: number,
  toolTokens: number,
  historyTokens: number,
  inputTokens: number
): string {
  const total = systemPromptTokens + toolTokens + historyTokens + inputTokens;
  return [
    `📊 Token Budget:`,
    `  System: ~${systemPromptTokens}t`,
    `  Tools:  ~${toolTokens}t`,
    `  History:~${historyTokens}t`,
    `  Input:  ~${inputTokens}t`,
    `  TOTAL:  ~${total}t`,
  ].join("\n");
}
