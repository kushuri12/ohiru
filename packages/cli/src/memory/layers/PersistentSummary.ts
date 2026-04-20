import fs from "fs-extra";
import path from "path";
import os from "os";

export class PersistentSummary {
  private filePath: string;

  constructor(customPath?: string) {
    this.filePath = customPath || path.join(os.homedir(), ".openhiru", "memory", "OPENHIRU.md");
    fs.ensureFileSync(this.filePath);
    this.initializeIfEmpty();
  }

  private async initializeIfEmpty() {
    const content = await fs.readFile(this.filePath, "utf8");
    if (!content.trim()) {
      const template = `# OPENHIRU MEMORY (Layer 3)

# Facts
- Concrete verified facts about the user/project.

# Preferences
- Observed preferences and habits.

# Rules
- Agent behavioral rules derived from feedback.

# Context
- Current project/task context.
`;
      await fs.writeFile(this.filePath, template);
    }
  }

  public async getSummary(): Promise<string> {
    return await fs.readFile(this.filePath, "utf8");
  }

  public async updateSection(section: string, entries: string[]): Promise<void> {
    let content = await this.getSummary();
    const sectionHeader = `# ${section}`;
    
    // Simple regex-based section update
    const lines = content.split("\n");
    const newLines = [];
    let inSection = false;
    let sectionAdded = false;

    for (const line of lines) {
      if (line.startsWith("# ") && inSection) {
        // Leaving the target section
        inSection = false;
      }

      if (line.trim() === sectionHeader) {
        inSection = true;
        newLines.push(line);
        entries.forEach(e => newLines.push(`- ${e}`));
        sectionAdded = true;
        continue;
      }

      if (!inSection) {
        newLines.push(line);
      }
    }

    if (!sectionAdded) {
      newLines.push(sectionHeader);
      entries.forEach(e => newLines.push(`- ${e}`));
    }

    await fs.writeFile(this.filePath, newLines.join("\n"));
  }
}
