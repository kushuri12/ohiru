import fs from "fs-extra";
import path from "path";
import os from "os";

export class DailyNotes {
  private baseDir: string;

  constructor(customDir?: string) {
    this.baseDir = customDir || path.join(os.homedir(), ".hiru", "memory", "notes");
    fs.ensureDirSync(this.baseDir);
  }

  public async appendToToday(summary: string): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    const filePath = path.join(this.baseDir, `${today}.md`);
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    
    const entry = `\n## ${time} — ${summary}\n`;
    await fs.appendFile(filePath, entry);
  }

  public async getNote(date: string): Promise<string | null> {
    const filePath = path.join(this.baseDir, `${date}.md`);
    if (!(await fs.pathExists(filePath))) return null;
    return await fs.readFile(filePath, "utf8");
  }

  public async listDates(): Promise<string[]> {
    const files = await fs.readdir(this.baseDir);
    return files.filter(f => f.endsWith(".md")).map(f => f.replace(".md", ""));
  }

  public async searchNotes(query: string): Promise<string[]> {
    const dates = await this.listDates();
    const results: string[] = [];
    for (const date of dates) {
      const content = await this.getNote(date);
      if (content?.toLowerCase().includes(query.toLowerCase())) {
        results.push(date);
      }
    }
    return results;
  }
}
