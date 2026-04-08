// src/thinking/ThinkingController.ts
// Kelas pusat yang mengorkestrasi thinking \u2192 planning \u2192 execution

import { EventEmitter } from "node:events";
import { ThinkingEngine } from "./ThinkingEngine.js";
import { PlanParser }     from "./PlanParser.js";
import { SectionParser, ParsedSection, SectionName } from "./SectionParser.js";
import type { ParsedPlan } from "./PlanParser.js";
import type { ThinkingBlock, ThinkingSection } from "./ThinkingEngine.js";

export type ThinkingMode = "compact" | "verbose" | "silent";

export interface ThinkingControllerConfig {
  mode: ThinkingMode;
  requirePlanApproval: boolean;   // Selalu minta konfirmasi sebelum execute
  autoApproveReadOnly: boolean;   // Auto-approve kalau tidak ada perubahan file
  showRawThinking: boolean;       // Tampilkan raw thinking text atau parsed saja
}

export class ThinkingController extends EventEmitter {
  private sectionParser = new SectionParser();
  private startTime = Date.now();
  private toolCallsInThinking = 0;
  private currentPlan: ParsedPlan | null = null;
  private sections: ParsedSection[] = [];
  private fullThinkingText = "";

  constructor(public config: ThinkingControllerConfig) {
    super();
  }

  updateConfig(config: Partial<ThinkingControllerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // Feed token dari streaming AI \u2014 panggil per-token
  feedToken(token: string): void {
    // Akumulasi teks untuk parsing section
    this.fullThinkingText += token;
    
    // Parse sections
    if (this.sectionParser.hasSectionTags(this.fullThinkingText)) {
        this.sections = this.sectionParser.parse(this.fullThinkingText);
    }
  }

  // Dipanggil saat AI membuat tool call selama fase thinking
  onToolCallDuringThinking(toolName: string, args: any): void {
    this.toolCallsInThinking++;
    this.emit("toolCallDuringThinking", { toolName, args, count: this.toolCallsInThinking });
  }

  // Dipanggil saat <plan>...</plan> block selesai
  onPlanReceived(rawPlan: string): ParsedPlan {
    const plan = new PlanParser().parse(rawPlan);
    this.currentPlan = plan;
    this.emit("planReady", plan);
    return plan;
  }

  // Evaluasi apakah plan butuh persetujuan user
  // Non-destructive plans auto-approve → one-shot plan+execute
  needsApproval(plan: ParsedPlan): boolean {
    if (!this.config.requirePlanApproval) return false;

    // TAMBAHAN: Low-confidence plan hanya butuh approval kalau DESTRUCTIVE
    if (plan.confidence === "low" && plan.isDestructive) return true;

    // Auto-approve kalau plan tidak destructive
    if (!plan.isDestructive) return false;

    // Auto-approve kalau semua file read-only (Fix Masalah di Telegram)
    if (this.config.autoApproveReadOnly) {
      const hasWrite = plan.filesAffected?.some(f => f.operation !== "read-only");
      if (!hasWrite) return false;
    }

    // Hanya minta approval untuk destructive plan
    return true;
  }

  // State snapshot untuk UI
  getDisplayState() {
    return {
      sections: this.sections,
      activeSection: this.getActiveSection(),
      toolCallsCount: this.toolCallsInThinking,
      elapsedMs: Date.now() - this.startTime,
      isThinkingComplete: this.sections.some(s => s.name === "SELESAI"),
    };
  }

  private getActiveSection(): SectionName | null {
    if (this.sections.length === 0) return "EXPLORE";
    const last = this.sections[this.sections.length - 1];
    return last.name;
  }

  reset(): void {
    this.startTime = Date.now();
    this.toolCallsInThinking = 0;
    this.currentPlan = null;
    this.sections = [];
    this.fullThinkingText = "";
  }
}
