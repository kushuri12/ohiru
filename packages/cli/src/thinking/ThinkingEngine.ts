/**
 * Komponen ini bertanggung jawab untuk:
 * 1. Mendeteksi thinking blocks dari streaming AI response
 * 2. Mem-parse section-section di dalamnya
 * 3. Mengemit event per-section agar UI bisa render secara live
 */

export type ThinkingSection =
  | "EXPLORE"
  | "ANALYZE"
  | "EVALUATE"
  | "DECIDE"
  | "PLAN"
  | "RISK";

export interface ThinkingBlock {
  section: ThinkingSection;
  content: string;
  timestamp: number;
  durationMs?: number;     // Berapa lama AI menghabiskan waktu di section ini
}

export interface ThinkingState {
  blocks: ThinkingBlock[];
  isComplete: boolean;
  totalDurationMs: number;
  toolCallsDuringThinking: string[];  // Tool calls yang dibuat untuk gather context
}

// Label yang tampil ke user — bukan raw section name
export const SECTION_LABELS: Record<ThinkingSection, string> = {
  EXPLORE:  "\ud83d\udd0d Exploring",
  ANALYZE:  "\ud83e\udde0 Analyzing",
  EVALUATE: "\u2696\ufe0f  Evaluating options",
  DECIDE:   "\u2713  Decision",
  PLAN:     "\ud83d\udccb Planning",
  RISK:     "\u26a0\ufe0f  Checking risks",
};

export const SECTION_COLORS: Record<ThinkingSection, string> = {
  EXPLORE:  "cyan",
  ANALYZE:  "yellow",
  EVALUATE: "blue",
  DECIDE:   "green",
  PLAN:     "white",
  RISK:     "red",
};

export class ThinkingEngine {
  private buffer = "";
  private inThinkingBlock = false;
  private currentSection: ThinkingSection | null = null;
  private sectionStart = 0;
  private blocks: ThinkingBlock[] = [];

  /**
   * Feed streaming text token by token.
   * Returns any completed ThinkingBlock untuk di-render segera.
   */
  feedToken(token: string): ThinkingBlock | null {
    this.buffer += token;

    // Deteksi masuk thinking block
    if (!this.inThinkingBlock && this.buffer.includes("<thinking>")) {
      this.inThinkingBlock = true;
      this.buffer = this.buffer.split("<thinking>")[1] ?? "";
    }

    // Deteksi keluar thinking block
    if (this.inThinkingBlock && this.buffer.includes("</thinking>")) {
      const parts = this.buffer.split("</thinking>");
      const content = parts[0];
      this.buffer = parts[1] ?? "";
      this.inThinkingBlock = false;

      // Parse sisa content yang belum sempat diemit
      this.parseRemainingContent(content);
      return null;
    }

    if (!this.inThinkingBlock) return null;

    // Deteksi section baru [SECTION_NAME]
    const sectionMatch = this.buffer.match(/\[([A-Z]+)\]\s*/);
    if (sectionMatch) {
      const newSection = sectionMatch[1] as ThinkingSection;

      if (this.hasValidSection(newSection)) {
        // Selesaikan section sebelumnya
        if (this.currentSection) {
          const splitPoint = this.buffer.indexOf(`[${newSection}]`);
          const beforeSection = this.buffer.slice(0, splitPoint);
          const completedBlock = this.finalizeSection(this.currentSection, beforeSection);
          
          this.buffer = this.buffer.slice(splitPoint + `[${newSection}]`.length);
          this.currentSection = newSection;
          this.sectionStart = Date.now();

          return completedBlock;
        } else {
          this.currentSection = newSection;
          this.sectionStart = Date.now();
          this.buffer = this.buffer.slice(this.buffer.indexOf(`[${newSection}]`) + `[${newSection}]`.length);
        }
      }
    }

    return null;
  }

  private finalizeSection(section: ThinkingSection, rawContent: string): ThinkingBlock | null {
    const content = rawContent
      .trim()
      .replace(/\[([A-Z]+)\]\s*/g, ""); // Hapus tag sisa

    if (!content && !this.currentSection) return null;

    const block: ThinkingBlock = {
      section,
      content: content || "...",
      timestamp: this.sectionStart,
      durationMs: Date.now() - this.sectionStart,
    };

    this.blocks.push(block);
    return block;
  }

  private hasValidSection(name: string): name is ThinkingSection {
    return ["EXPLORE", "ANALYZE", "EVALUATE", "DECIDE", "PLAN", "RISK"].includes(name);
  }

  private parseRemainingContent(content: string): void {
    if (this.currentSection && content.trim()) {
      this.finalizeSection(this.currentSection, content);
    }
  }

  getState(): ThinkingState {
    return {
      blocks: [...this.blocks],
      isComplete: !this.inThinkingBlock,
      totalDurationMs: this.blocks.reduce((s, b) => s + (b.durationMs ?? 0), 0),
      toolCallsDuringThinking: [],
    };
  }

  reset(): void {
    this.buffer = "";
    this.inThinkingBlock = false;
    this.currentSection = null;
    this.blocks = [];
  }
}
