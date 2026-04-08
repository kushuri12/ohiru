export interface ExecutionStep {
  number: number;
  verb: string;           // "Edit", "Create", "Run", "Read", "Delete"
  target: string;         // File path atau aksi
  reason: string;         // Alasan satu baris
  isDestructive: boolean; // True jika delete/overwrite/run command
  requiresConfirm: boolean; // Langkah ini butuh konfirmasi khusus?
}

export interface AffectedFile {
  path: string;
  operation: "create" | "modify" | "delete" | "read-only";
}

export interface ParsedPlan {
  raw: string;
  goal: string;
  steps: ExecutionStep[];
  filesAffected: AffectedFile[];
  assumptions: string[];
  risks: string[];
  isDestructive: boolean;     // True jika ada langkah delete/destructive
  estimatedSteps: number;
  confidence: "high" | "medium" | "low";  // Apakah plan terlihat solid?
}

// Kata kerja yang dianggap destructive
const DESTRUCTIVE_VERBS = new Set([
  "delete", "remove", "drop", "truncate", "overwrite",
  "reset", "clear", "wipe", "purge", "uninstall",
]);

export class PlanParser {

  parse(planBlockContent: string): ParsedPlan {
    const lines = planBlockContent.split("\n").map(l => l.trim()).filter(Boolean);

    const goal       = this.extractGoal(lines);
    const steps      = this.extractSteps(lines);
    const files      = this.extractFiles(lines);
    const assumptions = this.extractSection(lines, "ASSUMPTIONS");
    const risks      = this.extractSection(lines, "RISKS");

    const isDestructive = steps.some(s => s.isDestructive) ||
                          files.some(f => f.operation === "delete");

    const confidence = this.assessConfidence(goal, steps, risks);

    return {
      raw: planBlockContent,
      goal,
      steps,
      filesAffected: files,
      assumptions,
      risks,
      isDestructive,
      estimatedSteps: steps.length,
      confidence,
    };
  }

  private extractGoal(lines: string[]): string {
    const goalLine = lines.find(l => l.startsWith("GOAL:"));
    return goalLine ? goalLine.replace("GOAL:", "").trim() : "Complete the requested task";
  }

  private extractSteps(lines: string[]): ExecutionStep[] {
    const steps: ExecutionStep[] = [];
    let inSteps = false;

    for (const line of lines) {
      if (line === "STEPS:") { inSteps = true; continue; }
      if (line.match(/^[A-Z ]+:$/) && line !== "STEPS:") { inSteps = false; }
      if (!inSteps) continue;

      // Match nomor dan konten step
      const stepMatch = line.match(/^(\d+)\.\s+(.+)$/);
      if (!stepMatch) continue;

      const [, numStr, rest] = stepMatch;

      // Split berdasarkan — atau " - " (dengan spasi di kedua sisi untuk hindari false positive di path)
      const separatorMatch = rest.match(/^(.+?)\s+(?:—|–|\s-\s)\s*(.+)$/);
      const target = separatorMatch ? separatorMatch[1].trim() : rest.trim();
      const reason = separatorMatch ? separatorMatch[2].trim() : "No reason provided";

      // Ambil verb (kata pertama)
      const parts = target.split(/\s+/);
      const verb = parts[0] || "Execute";
      const targetPath = parts.slice(1).join(" ") || target;
      const verbLower = verb.toLowerCase();

      steps.push({
        number: parseInt(numStr),
        verb: verb.charAt(0).toUpperCase() + verb.slice(1),
        target: targetPath,
        reason,
        isDestructive: DESTRUCTIVE_VERBS.has(verbLower),
        requiresConfirm: DESTRUCTIVE_VERBS.has(verbLower) || targetPath.includes("*"),
      });
    }

    return steps;
  }

  private extractFiles(lines: string[]): AffectedFile[] {
    const files: AffectedFile[] = [];
    let inFiles = false;

    for (const line of lines) {
      if (line === "FILES AFFECTED:") { inFiles = true; continue; }
      if (line.match(/^[A-Z ]+:$/) && line !== "FILES AFFECTED:") { inFiles = false; }
      if (!inFiles || !line.startsWith("-")) continue;

      // "- path/to/file.ts  \u2192  modify"
      const match = line.match(/^-\s+(.+?)\s*(?:\u2192|->)\s*(create|modify|delete|read-only)/i);
      if (!match) continue;

      files.push({
        path: match[1].trim(),
        operation: match[2].toLowerCase() as AffectedFile["operation"],
      });
    }

    return files;
  }

  private extractSection(lines: string[], header: string): string[] {
    const items: string[] = [];
    let inSection = false;

    for (const line of lines) {
      if (line === `${header}:`) { inSection = true; continue; }
      if (line.match(/^[A-Z ]+:$/) && line !== `${header}:`) { inSection = false; }
      if (!inSection || !line.startsWith("-")) continue;
      items.push(line.replace(/^-\s*/, "").trim());
    }

    return items;
  }

  private assessConfidence(
    goal: string,
    steps: ExecutionStep[],
    risks: string[]
  ): "high" | "medium" | "low" {
    // Kurang dari 2 langkah \u2014 mungkin kurang analisis
    if (steps.length < 2) return "low";
    // Ada risiko dan langkah destruktif
    if (risks.length > 2 && steps.some(s => s.isDestructive)) return "medium";
    // Goal jelas, langkah spesifik, risiko diidentifikasi
    if (goal.length > 20 && steps.every(s => s.reason.length > 10)) return "high";
    return "medium";
  }
}
