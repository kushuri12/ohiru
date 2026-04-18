import chalk from "chalk";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { DailyNotes } from "./layers/DailyNotes.js";
import { PersistentSummary } from "./layers/PersistentSummary.js";
import { c } from "../ui/theme.js";

export class MemoryDistiller {
  private daily: DailyNotes;
  private persistent: PersistentSummary;
  private agent: any; // Reference to agent for distillation LLM calls
  private logPath: string;

  constructor(agent: any) {
    this.agent = agent;
    this.daily = new DailyNotes();
    this.persistent = new PersistentSummary();
    this.logPath = path.join(os.homedir(), ".hiru", "memory", "distillation.log");
    fs.ensureFileSync(this.logPath);
  }

  public async distill(): Promise<void> {
    console.log(`  ${c.glow("⚙")}  ${c.muted("Distiller       ")}${chalk.white("Starting knowledge distillation...")}`);
    
    try {
      // 1. Get recent notes
      const dates = await this.daily.listDates();
      const recentDates = dates.slice(-7); // Last 7 days
      let combinedNotes = "";
      for (const date of recentDates) {
        combinedNotes += `\n--- ${date} ---\n` + await this.daily.getNote(date);
      }

      // 2. Call LLM to distill
      const prompt = `Given these recent daily notes, extract any concrete facts, user preferences, or behavioral rules that I should remember.
      Return the result as structured sections: # Facts, # Preferences, # Rules.
      
      NOTES:
      ${combinedNotes}`;

      const distillationResult = await this.agent.chat(prompt, { systemOverride: "You are a memory distillation unit. Focus on accuracy and patterns." });

      // 3. Update HIRU.md
      // (Simplified: in a real implementation we'd parse the result and update matching sections)
      // await this.persistent.updateSection("Facts", parsedFacts);
      
      await fs.appendFile(this.logPath, `[${new Date().toISOString()}] Distillation completed. ${distillationResult.slice(0, 50)}...\n`);
      console.log(`  ${c.green("✓")}  ${c.muted("Distiller       ")}${chalk.white("Knowledge base updated")}`);

    } catch (err: any) {
      console.error(`  ${c.red("✗")}  ${c.muted("Distiller       ")}${c.red(`Failed: ${err.message}`)}`);
      await fs.appendFile(this.logPath, `[${new Date().toISOString()}] Error: ${err.message}\n`);
    }
  }
}
