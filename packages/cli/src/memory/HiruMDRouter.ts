import fs from "fs-extra";
import path from "path";
import type { TaskCategory } from "../agent/SmartContext.js";

export interface HiruMDSections {
  facts: string;        // ## Facts section
  preferences: string;  // ## Preferences section  
  rules: string;        // ## Rules section
  context: string;      // ## Context section
  raw: string;          // Full unparsed content
}

// Which sections to inject per task category
const SECTION_MAP: Record<TaskCategory, (keyof HiruMDSections)[]> = {
  chat:    ["facts", "preferences"],
  web:     ["facts"],
  file:    ["context", "rules"],
  shell:   ["context", "rules"],
  code:    ["facts", "context", "rules"],
  desktop: ["context", "rules"],
  skill:   ["preferences", "rules"],
  plugin:  ["preferences"],
  memory:  ["facts", "preferences", "rules", "context"],
  full:    ["facts", "preferences", "rules", "context"],
};

// Max chars per section to prevent bloat
const SECTION_MAX: Record<keyof HiruMDSections, number> = {
  facts:       600,
  preferences: 300,
  rules:       500,
  context:     400,
  raw:         2000,
};

/**
 * HiruMDRouter
 * Parses HIRU.md sections and returns only what's needed for this task.
 */
export class HiruMDRouter {
  constructor(private hiruMDPath: string) {}

  /**
   * Parse HIRU.md into sections by ## headings.
   */
  async parseSections(): Promise<HiruMDSections> {
    if (!(await fs.pathExists(this.hiruMDPath))) {
      return { facts: "", preferences: "", rules: "", context: "", raw: "" };
    }

    const content = await fs.readFile(this.hiruMDPath, "utf8");
    const sections: HiruMDSections = {
      facts: "",
      preferences: "",
      rules: "",
      context: "",
      raw: content,
    };

    const lines = content.split("\n");
    let currentSection: keyof HiruMDSections | null = null;
    let sectionBuffer: string[] = [];

    const flush = () => {
      if (currentSection) {
        sections[currentSection] = sectionBuffer.join("\n").trim();
      }
      sectionBuffer = [];
    };

    for (const line of lines) {
      if (line.startsWith("## ")) {
        flush();
        const header = line.toLowerCase();
        if (header.includes("fact")) currentSection = "facts";
        else if (header.includes("pref")) currentSection = "preferences";
        else if (header.includes("rule")) currentSection = "rules";
        else if (header.includes("context")) currentSection = "context";
        else currentSection = null;
      } else if (currentSection) {
        sectionBuffer.push(line);
      }
    }
    flush();

    // Enforce limits
    for (const key of Object.keys(SECTION_MAX) as (keyof HiruMDSections)[]) {
      if (sections[key].length > SECTION_MAX[key]) {
        sections[key] = sections[key].slice(0, SECTION_MAX[key]) + "... [truncated]";
      }
    }

    return sections;
  }

  /**
   * Return only the sections relevant for this task category.
   */
  async getRelevantContext(category: TaskCategory): Promise<string> {
    const sections = await this.parseSections();
    const needed = SECTION_MAP[category] || SECTION_MAP.full;

    const output: string[] = ["## HIRU.md PROJECT MEMORY"];
    for (const key of needed) {
      const content = sections[key];
      if (content) {
        output.push(`### ${key.toUpperCase()}`);
        output.push(content);
      }
    }

    if (output.length === 1) return ""; // Only header present
    return output.join("\n\n");
  }

  /**
   * Estimate token savings vs raw injection (4 chars ≈ 1 token approximation).
   */
  async getSavingsEstimate(): Promise<{ raw: number; routed: Record<TaskCategory, number> }> {
    const sections = await this.parseSections();
    const rawLen = sections.raw.length;
    
    const estimate = (text: string) => Math.ceil(text.length / 4);
    
    const routed: any = {};
    for (const cat of Object.keys(SECTION_MAP) as TaskCategory[]) {
      const relevant = await this.getRelevantContext(cat);
      routed[cat] = estimate(relevant);
    }

    return {
      raw: estimate(sections.raw),
      routed,
    };
  }
}
