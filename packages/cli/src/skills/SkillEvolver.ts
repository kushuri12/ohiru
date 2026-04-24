import chalk from "chalk";
import fs from "fs-extra";
import path from "path";
import { HIRU_DATA_DIR } from "../utils/paths.js";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface SkillProposal {
  name: string;
  description: string;
  trigger: string; // What instruction triggered this
  confidence: number; // 0–1
  tags: string[];
  proposedAt: string;
  approved?: boolean;
}

export interface SkillUsageRecord {
  skillName: string;
  usedAt: string;
  success: boolean;
  args?: Record<string, any>;
}

interface EvolverState {
  instructionHistory: string[];
  proposalHistory: SkillProposal[];
  usageHistory: SkillUsageRecord[];
  lastAnalyzedAt?: string;
}

// ─────────────────────────────────────────────────────────────
// SkillEvolver — Smart Pattern Detector & Skill Proposer
// ─────────────────────────────────────────────────────────────

/**
 * SkillEvolver watches instruction history and usage patterns to
 * proactively propose new skills the AI should create and save.
 * 
 * Improvements over v1:
 * - Persistent state across restarts (JSON file in .openhiru/data/)
 * - Pattern-based duplication detection (keyword similarity)
 * - Confidence scoring for proposals
 * - Usage analytics to identify high-value skills
 * - Keyword extraction for smarter analysis
 */
export class SkillEvolver {
  private agent: any;
  private state: EvolverState = {
    instructionHistory: [],
    proposalHistory: [],
    usageHistory: [],
  };
  private stateFile: string;
  private readonly MAX_HISTORY = 200;
  private readonly MAX_PROPOSALS = 50;
  private readonly MAX_USAGE = 500;
  private readonly ANALYSIS_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

  // Keywords that strongly suggest a skill should be created
  private static readonly SKILL_KEYWORDS = [
    "cek", "check", "fetch", "get", "jadwal", "schedule", "info", "status",
    "monitor", "track", "search", "find", "list", "summary", "report",
    "convert", "translate", "calculate", "analyze", "generate", "create",
    "anime", "cuaca", "weather", "crypto", "stock", "news", "harga", "price",
    "git", "github", "npm", "docker", "deploy", "build",
  ];

  // Domains that map to tag suggestions
  private static readonly TAG_MAP: Record<string, string[]> = {
    anime: ["anime", "jikan", "myanimelist"],
    cuaca: ["weather", "geo", "indonesia"],
    weather: ["weather", "geo"],
    crypto: ["crypto", "finance", "binance"],
    stock: ["stock", "finance", "market"],
    news: ["news", "media"],
    git: ["git", "github", "dev"],
    npm: ["npm", "nodejs", "dev"],
    docker: ["docker", "devops"],
    harga: ["price", "market", "indonesia"],
    monitor: ["system", "monitoring"],
  };

  constructor(agent: any) {
    this.agent = agent;
    this.stateFile = path.join(HIRU_DATA_DIR, "skill_evolver_state.json");
    this.loadState().catch(() => {});
  }

  // ── Persistence ───────────────────────────────────────────

  private async loadState(): Promise<void> {
    try {
      if (await fs.pathExists(this.stateFile)) {
        const raw = await fs.readFile(this.stateFile, "utf8");
        this.state = JSON.parse(raw);
        if (!this.state.instructionHistory) this.state.instructionHistory = [];
        if (!this.state.proposalHistory) this.state.proposalHistory = [];
        if (!this.state.usageHistory) this.state.usageHistory = [];
      }
    } catch {
      // Start fresh if corrupted
    }
  }

  private async saveState(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.stateFile), { recursive: true });
      await fs.writeFile(this.stateFile, JSON.stringify(this.state, null, 2), "utf8");
    } catch {
      // Ignore save errors
    }
  }

  // ── Instruction Recording ─────────────────────────────────

  /**
   * Record a user instruction. Analyzes for patterns after accumulation.
   */
  public recordInstruction(instruction: string): void {
    const trimmed = instruction.trim();
    if (!trimmed || trimmed.length < 5) return;

    this.state.instructionHistory.push(trimmed);

    // Trim to max size (FIFO)
    if (this.state.instructionHistory.length > this.MAX_HISTORY) {
      this.state.instructionHistory = this.state.instructionHistory.slice(-this.MAX_HISTORY);
    }

    // Auto-save asynchronously
    this.saveState().catch(() => {});

    // Check if this instruction alone strongly suggests a skill
    const autoProposal = this.checkInstantProposal(trimmed);
    if (autoProposal) {
      this.addProposal(autoProposal);
    }
  }

  // ── Usage Tracking ────────────────────────────────────────

  /**
   * Record that a skill was used (called by the agent runtime).
   */
  public recordSkillUsage(skillName: string, success: boolean, args?: Record<string, any>): void {
    this.state.usageHistory.push({
      skillName,
      usedAt: new Date().toISOString(),
      success,
      args,
    });

    if (this.state.usageHistory.length > this.MAX_USAGE) {
      this.state.usageHistory = this.state.usageHistory.slice(-this.MAX_USAGE);
    }

    this.saveState().catch(() => {});
  }

  // ── Instant Pattern Detection ─────────────────────────────

  /**
   * Check if a single instruction immediately warrants a skill proposal.
   * Used for high-confidence, keyword-rich instructions.
   */
  private checkInstantProposal(instruction: string): SkillProposal | null {
    const lower = instruction.toLowerCase();
    const words = lower.split(/\s+/);

    // Count skill keywords
    const hitKeywords = SkillEvolver.SKILL_KEYWORDS.filter(kw => lower.includes(kw));
    if (hitKeywords.length < 2) return null; // Need at least 2 skill-related keywords

    // Score by keyword density
    const confidence = Math.min(hitKeywords.length * 0.15 + 0.3, 0.9);

    // Generate a skill name from the instruction
    const skillName = this.extractSkillName(instruction, hitKeywords);
    if (!skillName) return null;

    // Check if we already proposed this
    if (this.isAlreadyProposed(skillName)) return null;

    // Extract tags
    const tags = this.extractTags(hitKeywords);

    return {
      name: skillName,
      description: `Auto-detected: ${instruction.slice(0, 100)}`,
      trigger: instruction,
      confidence,
      tags,
      proposedAt: new Date().toISOString(),
    };
  }

  // ── Pattern Analysis (Full) ───────────────────────────────

  /**
   * Full pattern analysis over instruction history.
   * Runs periodically or on demand.
   */
  public async analyzePatterns(): Promise<void> {
    if (this.state.instructionHistory.length < 3) return;

    // Check if we analyzed recently
    const lastAnalyzed = this.state.lastAnalyzedAt
      ? Date.parse(this.state.lastAnalyzedAt)
      : 0;
    if (Date.now() - lastAnalyzed < this.ANALYSIS_INTERVAL_MS) return;

    console.log(chalk.cyan(`[SkillEvolver] Analyzing ${this.state.instructionHistory.length} instructions for patterns...`));

    // Find recurring patterns
    const keywordFrequency = this.computeKeywordFrequency();
    const topKeywords = Object.entries(keywordFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([kw]) => kw);

    // For each top keyword group, check if a skill should be proposed
    for (const kw of topKeywords) {
      const relatedInstructions = this.state.instructionHistory.filter(inst =>
        inst.toLowerCase().includes(kw)
      );

      if (relatedInstructions.length >= 3) {
        const skillName = `${kw.replace(/\s+/g, "_")}_skill`;
        if (!this.isAlreadyProposed(skillName)) {
          const tags = this.extractTags([kw]);
          const confidence = Math.min(0.4 + relatedInstructions.length * 0.1, 0.95);
          this.addProposal({
            name: skillName,
            description: `Recurring pattern detected: "${kw}" appears in ${relatedInstructions.length} instructions`,
            trigger: relatedInstructions[relatedInstructions.length - 1],
            confidence,
            tags,
            proposedAt: new Date().toISOString(),
          });
        }
      }
    }

    // AI-powered analysis if agent is available and has chat capability
    if (this.agent && typeof this.agent.chat === "function" && this.state.instructionHistory.length >= 10) {
      try {
        const recentInstructions = this.state.instructionHistory.slice(-20).join("\n- ");
        const prompt = `Recent user instructions:\n- ${recentInstructions}\n\nIdentify any recurring task pattern that could become a reusable skill. If found, respond with EXACTLY:\nPROPOSAL: <skill_name> | <description>\nOtherwise respond: NO_PATTERN`;

        const response = await Promise.race([
          this.agent.chat(prompt, { systemOverride: "You are a skill optimization engine. Be concise. Only respond with PROPOSAL: or NO_PATTERN." }),
          new Promise<string>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
        ]) as string;

        if (response.includes("PROPOSAL:")) {
          const match = response.match(/PROPOSAL:\s*([^|]+)\|(.+)/);
          if (match) {
            const [, name, desc] = match;
            const cleanName = name.trim().replace(/[^a-z0-9_]/gi, "_").toLowerCase();
            if (cleanName && !this.isAlreadyProposed(cleanName)) {
              console.log(chalk.bold.hex("#CC785C")(`[SkillEvolver] 🧠 AI Proposal: "${cleanName}" — ${desc.trim()}`));
              this.addProposal({
                name: cleanName,
                description: desc.trim(),
                trigger: "AI pattern analysis",
                confidence: 0.75,
                tags: this.extractTags([cleanName]),
                proposedAt: new Date().toISOString(),
              });
            }
          }
        }
      } catch {
        // Ignore AI analysis failures
      }
    }

    this.state.lastAnalyzedAt = new Date().toISOString();
    await this.saveState();
  }

  // ── Helpers ───────────────────────────────────────────────

  private computeKeywordFrequency(): Record<string, number> {
    const freq: Record<string, number> = {};
    for (const instruction of this.state.instructionHistory) {
      const lower = instruction.toLowerCase();
      for (const kw of SkillEvolver.SKILL_KEYWORDS) {
        if (lower.includes(kw)) {
          freq[kw] = (freq[kw] || 0) + 1;
        }
      }
    }
    return freq;
  }

  private extractSkillName(instruction: string, hitKeywords: string[]): string | null {
    // Try to build a name from the most relevant keywords
    const lower = instruction.toLowerCase();
    const words = lower.split(/\s+/).filter(w => w.length > 2);

    // Find domain keyword
    const domainKw = hitKeywords.find(kw =>
      Object.keys(SkillEvolver.TAG_MAP).includes(kw)
    );

    // Find action keyword
    const actionKw = ["cek", "check", "get", "fetch", "monitor", "track", "search",
      "generate", "convert", "calculate"].find(a => lower.includes(a));

    if (domainKw && actionKw) {
      return `${actionKw}_${domainKw}`.replace(/[^a-z0-9_]/g, "_");
    } else if (domainKw) {
      return `cek_${domainKw}`;
    } else if (hitKeywords.length > 0) {
      return hitKeywords.slice(0, 2).join("_").replace(/[^a-z0-9_]/g, "_");
    }
    return null;
  }

  private extractTags(keywords: string[]): string[] {
    const tags = new Set<string>();
    for (const kw of keywords) {
      const mapped = SkillEvolver.TAG_MAP[kw];
      if (mapped) mapped.forEach(t => tags.add(t));
      else tags.add(kw);
    }
    return Array.from(tags);
  }

  private isAlreadyProposed(name: string): boolean {
    return this.state.proposalHistory.some(p =>
      p.name === name ||
      p.name.replace(/_/g, "") === name.replace(/_/g, "")
    );
  }

  private addProposal(proposal: SkillProposal): void {
    this.state.proposalHistory.push(proposal);
    if (this.state.proposalHistory.length > this.MAX_PROPOSALS) {
      this.state.proposalHistory = this.state.proposalHistory.slice(-this.MAX_PROPOSALS);
    }
  }

  // ── Public API ────────────────────────────────────────────

  /**
   * Get all pending (unapproved) proposals sorted by confidence.
   */
  public getPendingProposals(): SkillProposal[] {
    return this.state.proposalHistory
      .filter(p => !p.approved)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get usage statistics for skills.
   */
  public getUsageStats(): Record<string, { total: number; successes: number; failures: number }> {
    const stats: Record<string, { total: number; successes: number; failures: number }> = {};
    for (const record of this.state.usageHistory) {
      if (!stats[record.skillName]) {
        stats[record.skillName] = { total: 0, successes: 0, failures: 0 };
      }
      stats[record.skillName].total++;
      if (record.success) stats[record.skillName].successes++;
      else stats[record.skillName].failures++;
    }
    return stats;
  }

  /**
   * Approve a proposal (mark it as handled).
   */
  public approveProposal(name: string): void {
    const proposal = this.state.proposalHistory.find(p => p.name === name);
    if (proposal) {
      proposal.approved = true;
      this.saveState().catch(() => {});
    }
  }

  /**
   * Get a summary of the evolver state for debugging.
   */
  public getSummary(): string {
    const pending = this.getPendingProposals();
    const stats = this.getUsageStats();
    const topSkills = Object.entries(stats)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5);

    const parts = [
      `📊 Skill Evolver Summary`,
      `  • Instructions tracked: ${this.state.instructionHistory.length}`,
      `  • Proposals pending: ${pending.length}`,
      `  • Skills tracked: ${Object.keys(stats).length}`,
    ];

    if (pending.length > 0) {
      parts.push(`\n🔮 Top Proposals:`);
      pending.slice(0, 3).forEach(p => {
        const pct = Math.round(p.confidence * 100);
        parts.push(`  • ${p.name} (${pct}% confidence) — ${p.description.slice(0, 60)}`);
      });
    }

    if (topSkills.length > 0) {
      parts.push(`\n🏆 Most Used Skills:`);
      topSkills.forEach(([name, s]) => {
        const rate = s.total > 0 ? Math.round((s.successes / s.total) * 100) : 0;
        parts.push(`  • ${name}: ${s.total} uses, ${rate}% success`);
      });
    }

    return parts.join("\n");
  }
}
