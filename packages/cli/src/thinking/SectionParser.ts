// packages/cli/src/thinking/SectionParser.ts

export type SectionName =
  | "EXPLORE" | "ANALYZE" | "EVALUATE"
  | "DECIDE"  | "PLAN"    | "RISK"
  | "SELESAI" | "DONE"    | "SUMMARY";

export interface ParsedSection {
  name: SectionName;
  content: string;
  rawTag: string;   // Tag asli dari AI \u2014 bisa bervariasi
}

// Map semua variasi tag yang mungkin dihasilkan AI \u2192 nama canonical
const TAG_ALIASES: Record<string, SectionName> = {
  // Bahasa Inggris
  "EXPLORE":   "EXPLORE",
  "EXPLORING": "EXPLORE",
  "SEARCH":    "EXPLORE",
  "LOOK":      "EXPLORE",
  "READ":      "EXPLORE",

  "ANALYZE":   "ANALYZE",
  "ANALYSIS":  "ANALYZE",
  "INSPECT":   "ANALYZE",
  "EXAMINE":   "ANALYZE",

  "EVALUATE":  "EVALUATE",
  "OPTIONS":   "EVALUATE",
  "CONSIDER":  "EVALUATE",
  "COMPARE":   "EVALUATE",
  "WEIGH":     "EVALUATE",

  "DECIDE":    "DECIDE",
  "DECISION":  "DECIDE",
  "CHOOSE":    "DECIDE",
  "CHOSEN":    "DECIDE",
  "SELECTED":  "DECIDE",

  "PLAN":      "PLAN",
  "PLANNING":  "PLAN",
  "STEPS":     "PLAN",

  "RISK":      "RISK",
  "RISKS":     "RISK",
  "WARNING":   "RISK",
  "CAUTION":   "RISK",

  "DONE":      "SELESAI",
  "SUMMARY":   "SELESAI",
  "COMPLETE":  "SELESAI",
  "RESULT":    "SELESAI",

  // Bahasa Indonesia (karena AI kadang jawab dalam Bahasa Indonesia)
  "JELAJAHI":  "EXPLORE",
  "EKSPLORASI":"EXPLORE",
  "ANALISIS":  "ANALYZE",
  "ANALISA":   "ANALYZE",
  "EVALUASI":  "EVALUATE",
  "PILIHAN":   "EVALUATE",
  "KEPUTUSAN": "DECIDE",
  "RENCANA":   "PLAN",
  "RISIKO":    "RISK",
  "SELESAI":   "SELESAI",
  "RINGKASAN": "SELESAI",

  // ASCII fallback symbols yang dipakai di Windows PowerShell
  "?":  "EXPLORE",   // [?]
  "~":  "ANALYZE",   // [~]
  "=":  "EVALUATE",  // [=]
  "P":  "PLAN",      // [P]
  "!":  "RISK",      // [!]
  "V":  "DECIDE",    // [V] atau [v]
  "v":  "DECIDE",
};

export class SectionParser {

  // Parse string thinking \u2192 array of sections
  parse(thinkingContent: string): ParsedSection[] {
    const sections: ParsedSection[] = [];

    // 1. Handle multi-char tags [EXPLORE], [ANALYZE], etc.
    const tagPattern = /\[([A-Z_\s]{3,})\]/g;
    const parts = thinkingContent.split(tagPattern);
    
    let i = 1;
    while (i < parts.length - 1) {
      const rawTag = parts[i].trim();
      const content = parts[i + 1].trim();
      i += 2;

      const normalized = rawTag.toUpperCase().replace(/\s+/g, "_");
      const sectionName = TAG_ALIASES[normalized];

      if (sectionName && content) {
        sections.push({
          name: sectionName,
          content,
          rawTag: `[${rawTag}]`,
        });
      }
    }

    // 2. Handle single-char ASCII fallback tags: [?], [~], [=], [P], [!], [V]
    // Kita lakukan pencocokan terpisah untuk simbol-simbol ini
    const singleCharPattern = /\[([?~=PVv!])\]\s*(.*?)(?=\[|$)/gs;
    let match;
    while ((match = singleCharPattern.exec(thinkingContent)) !== null) {
      const char = match[1];
      const content = match[2].trim();
      const sectionName = TAG_ALIASES[char];

      if (sectionName && content) {
        // Hindari duplikasi jika tag sudah diproses (meskipun regex di atas membatasi {3,})
        sections.push({
          name: sectionName,
          content,
          rawTag: `[${char}]`,
        });
      }
    }

    return sections;
  }

  // Cek apakah string mengandung section tags
  hasSectionTags(text: string): boolean {
    return /\[[A-Z_\s]{3,}\]/.test(text) || /\[[?~=PVv!]\]/.test(text);
  }
}
