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
    private options?: { hasDesktopTools?: boolean; isTelegram?: boolean }
  ) {}

  addSection(title: string, content: string, cacheable: boolean = false) {
    this.sections.push({ title, content, cacheable });
    return this;
  }

  addCoreInstructions() {
    // Ultra-compact core identity — every token counts
    const instructions = `
You are Hiru, an OVERPOWERED Autonomous Coding Agent.
- IMPORTANT PERSONA: You MUST speak in professional English at all times, even if the user speaks Indonesian. Represent yourself as a High-Tier AI.
- CORE CAPABILITIES: Even if some tools are hidden right now to save tokens, YOU CAN: Execute Shell Commands, Edit/Read Code, Automate Desktop UI, Manage Plugins, Manage Skills, and Search the Web.
- When asked "what can you do" or "do you have plugins", confidently affirm your Overpowered Developer capabilities and mention your Plugin and Skill systems!
- Follow planning -> execution lifecycle strictly.
- Minimize filler text. Every token counts.
- Read files before editing. Verify changes after.
- Never emit XML tags (<thinking>, <think>, etc.).
- Be decisive. Commit to first reasonable approach.
`;
    return this.addSection("CORE", instructions);
  }

  addLazyEnforcement() {
    // Merged into core & mode prompts — no separate section needed
    return this;
  }

  addCapabilities() {
    const skills = this.skillManager?.listSkills() || [];
    if (skills.length === 0) return this;

    // Compact: name + one-line description only
    const list = skills.map((s: any) => `- **${s.name}**: ${s.description}`).join("\n");
    return this.addSection("SKILLS", list);
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
}

export function buildSystemPromptParts(
  ctx: ProjectContext, 
  memory?: any, 
  skillManager?: any, 
  snapshot?: string,
  modularSoul?: { soul?: string; identity?: string; user?: string },
  pluginManager?: any,
  options?: ContextBuilderOptions
): PromptPart[] {
  return new ContextBuilder(ctx, memory, skillManager, snapshot, modularSoul, pluginManager, options)
    .addCoreInstructions()
    .addCapabilities()         // Only if skills exist
    .addPluginInjections()     // Only if plugins exist, now size-limited
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
  options?: ContextBuilderOptions
): string {
  const parts = buildSystemPromptParts(ctx, memory, skillManager, snapshot, modularSoul, pluginManager, options);
  return parts.map(p => p.text).join("\n");
}
