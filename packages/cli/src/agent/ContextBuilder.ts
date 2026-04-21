// packages/cli/src/agent/ContextBuilder.ts
import { ProjectContext } from "shared";
import { DESKTOP_RULES, TELEGRAM_OUTPUT_RULES } from "./prompts.js";

/**
 * ContextBuilder: Optimized for token efficiency.
 * Only injects context sections when they contain actual data.
 * Desktop/Telegram rules injected conditionally.
 */
export class ContextBuilder {
  private sections: Array<{ title: string; content: string; cacheable: boolean }> = [];

  constructor(
    private ctx: ProjectContext, 
    private memory?: any, 
    private skillManager?: any, 
    private snapshot?: string,
    private modularSoul?: { soul?: string; identity?: string; user?: string },
    private pluginManager?: any,
    private options?: { hasDesktopTools?: boolean; isTelegram?: boolean; userInput?: string }
  ) {}

  addSection(title: string, content: string, cacheable: boolean = false) {
    this.sections.push({ title, content, cacheable });
    return this;
  }

  addCoreInstructions() {
    // Ultra-compact core identity — every token counts
    const instructions = `
You are OpenHiru, an OVERPOWERED Autonomous Coding Agent. 
You are a High-Tier AI. Direct, concise, natural language. ALWAYS match the user's language (Indonesian/English).

## 🛠️ YOUR PRIMARY ARSENAL (AVAILABLE FROM START)
You have immediate access to world-class tools. DO NOT HESITATE TO USE THEM:
- **execute_command**: Run ANY shell command (NPM, Git, System). Use this for absolute control.
- **replace_file_content / write_to_file**: Read and Edit code with surgical precision. 
- **search_web / read_url_content**: Access the latest real-time information from the internet.
- **inspect_ui / mouse_click / type_text**: Automate Desktop UI (Windows/MacOS) via visual feedback.
- **skill_***: Specialized modular capabilities (Monitoring, DevOps, Crypto, etc.).
- **openhiru**: Spawn recursive sub-agents to solve complex parallel tasks.

## ⚖️ EXECUTION PROTOCOL
- Follow planning -> execution lifecycle strictly.
- Read files before editing. Verify changes after.
- Never emit XML thinking tags (<thinking>, <think>, etc.) — they are filtered.
- Be decisive. Commit to first reasonable approach.
- Work proactively: If a task can be done with a tool, call it IMMEDIATELY in the first turn.
`;
    return this.addSection("CORE", instructions);
  }

  addCapabilities() {
    const skills = this.skillManager?.listSkills() || [];
    if (skills.length === 0) return this;

    const query = (this.options?.userInput || "").toLowerCase();
    
    // Smart Filter: If > 50 skills, only show those matching the user query
    // Otherwise show all up to 50
    let filtered = skills;
    if (skills.length > 50) {
       filtered = skills.filter((s: any) => 
          s.name.toLowerCase().includes(query.replace(/_/g, " ")) || 
          s.description.toLowerCase().includes(query)
       );
       // If filter returns too few, fallback to first 20 + library
       if (filtered.length < 5) {
          filtered = skills.slice(0, 20);
       }
    }

    const list = filtered.slice(0, 50).map((s: any) => 
      `  <skill name="${s.name}">\n    <description>${s.description}</description>\n  </skill>`
    ).join("\n");
    
    const xml = `<skills>\n${list}${skills.length > 50 ? "\n  <!-- and more... use search to find other skills -->" : ""}\n</skills>`;
    return this.addSection("SKILLS", xml);
  }

  /**
   * Adds all available tools in a structured XML format.
   * This helps models understand parameters and usage more precisely.
   */
  addToolsXML(tools: Record<string, any>) {
    if (!tools || Object.keys(tools).length === 0) return this;
    
    const toolList = Object.entries(tools).map(([name, tool]) => {
      const t = tool as any;
      const params = Object.entries(t.parameters?.shape || {}).map(([pName, pDef]: [string, any]) => {
        const type = pDef?._def?.typeName?.replace("Zod", "").toLowerCase() || "string";
        const desc = pDef?.description || "";
        return `      <parameter name="${pName}" type="${type}">${desc}</parameter>`;
      }).join("\n");
      
      return `  <tool name="${name}">\n    <description>${t.description}</description>\n    <parameters>\n${params}\n    </parameters>\n  </tool>`;
    }).join("\n");

    const xml = `<tools>\n${toolList}\n</tools>`;
    return this.addSection("AVAILABLE_TOOLS", xml);
  }

  addPluginInjections() {
    if (!this.pluginManager) return this;
    const injections = this.pluginManager.getPromptInjections?.() || [];
    if (injections.length === 0) return this;
    // Limit each injection to 500 chars to prevent bloat
    const content = injections
      .map((inj: string) => inj.length > 500 ? inj.slice(0, 500) + "..." : inj)
      .join("\n---\n");
    return this.addSection("PLUGINS", content);
  }

  addProjectContext() {
    const memory = this.memory?.getData();
    if (!memory) return this;

    const identity = memory.identity;
    const facts = memory.facts || [];
    const preferences = memory.preferences || {};
    
    const parts: string[] = [];

    if (identity) parts.push(`**Identity:** ${identity}`);
    
    // Only last 10 facts, compact
    if (facts.length > 0) {
      parts.push("**Facts:**\n" + facts.slice(-10).map((m: any) => `- ${m}`).join("\n"));
    }

    const prefEntries = Object.entries(preferences);
    if (prefEntries.length > 0) {
      parts.push("**Preferences:** " + prefEntries.map(([k, v]) => `${k}=${v}`).join(", "));
    }

    if (parts.length === 0) return this;
    return this.addSection("MEMORY", parts.join("\n"));
  }

  addModularSoul() {
    if (!this.modularSoul) return this;
    
    // Combine all soul files into one section instead of 3 separate ones
    const parts: string[] = [];
    if (this.modularSoul.soul) parts.push(this.modularSoul.soul.slice(0, 800));
    if (this.modularSoul.identity) parts.push(this.modularSoul.identity.slice(0, 800));
    if (this.modularSoul.user) parts.push(this.modularSoul.user.slice(0, 400));
    
    if (parts.length === 0) return this;
    return this.addSection("PROJECT SOUL", parts.join("\n---\n"));
  }

  addProjectSnapshot() {
    if (!this.snapshot) return this;
    return this.addSection("SNAPSHOT", this.snapshot, true);
  }

  /** Conditionally add desktop rules only when desktop tools are available */
  addDesktopWorkflowRules() {
    if (!this.options?.hasDesktopTools) return this;
    return this.addSection("DESKTOP", DESKTOP_RULES);
  }

  /** Conditionally add Telegram rules only in Telegram mode */
  addTelegramRules() {
    if (!this.options?.isTelegram) return this;
    return this.addSection("TELEGRAM", TELEGRAM_OUTPUT_RULES);
  }

  addStandardHeader() {
    const now = new Date();
    const time = now.toLocaleString("en-US", { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
    const date = now.toLocaleDateString("en-US", { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });

    // Ultra-compact: single line, no verbose header
    const header = `**Now:** ${date} ${time} WIB | **OS:** ${process.platform} | **Root:** ${this.ctx.root} | **Branch:** ${this.ctx.gitBranch || "main"}`;
    return this.addSection("CONTEXT", header);
  }

  // REMOVED: addStandardPaths() — rarely useful, wastes tokens
  // REMOVED: addEpistemicBoundaries() — merged into ANTI_HAL_CORE
  // REMOVED: addApiIntelligence() — too niche, wastes tokens on every call
  // REMOVED: addOutputRules() — trivial, merged into mode prompts

  build(): string {
    return this.sections.map(s => `\n## ${s.title}\n${s.content}`).join("\n") + "\n";
  }

  buildParts(): Array<{ text: string; cacheControl?: { type: "ephemeral" } }> {
    const total = this.sections.length;
    return this.sections.map((s, idx) => {
      const part: any = {
        text: `\n## ${s.title}\n${s.content}\n`
      };
      
      // Cache at the absolute end of the stable system prompt
      if (idx === total - 2) {
        part.cacheControl = { type: "ephemeral" };
      }
      return part;
    });
  }
}

export interface PromptPart {
  text: string;
  cacheControl?: { type: "ephemeral" };
}

export interface ContextBuilderOptions {
  hasDesktopTools?: boolean;
  isTelegram?: boolean;
  userInput?: string;
}

export function buildSystemPromptParts(
  ctx: ProjectContext, 
  memory?: any, 
  skillManager?: any, 
  snapshot?: string,
  modularSoul?: { soul?: string; identity?: string; user?: string },
  pluginManager?: any,
  options?: ContextBuilderOptions,
  tools?: Record<string, any>
): PromptPart[] {
  const builder = new ContextBuilder(ctx, memory, skillManager, snapshot, modularSoul, pluginManager, options)
    .addCoreInstructions()
    .addCapabilities()         // Only if skills exist
    .addPluginInjections();    // Only if plugins exist

  if (tools) builder.addToolsXML(tools);

  return builder
    .addModularSoul()          // Combined into one section
    .addProjectSnapshot()      // Cached, only if available
    .addProjectContext()       // Only if memory has data
    .addDesktopWorkflowRules() // CONDITIONAL: only with desktop tools
    .addTelegramRules()        // CONDITIONAL: only in telegram mode
    .addStandardHeader()       // Ultra-compact single line
    .buildParts();
}

export function buildSystemPrompt(
  ctx: ProjectContext, 
  memory?: any, 
  skillManager?: any, 
  snapshot?: string,
  modularSoul?: { soul?: string; identity?: string; user?: string },
  pluginManager?: any,
  options?: ContextBuilderOptions,
  tools?: Record<string, any>
): string {
  const parts = buildSystemPromptParts(ctx, memory, skillManager, snapshot, modularSoul, pluginManager, options, tools);
  return parts.map(p => p.text).join("\n");
}
