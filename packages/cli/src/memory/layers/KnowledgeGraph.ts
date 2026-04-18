import fs from "fs-extra";
import path from "path";
import os from "os";
import { KnowledgeEntity, KnowledgeEntitySchema } from "./KnowledgeEntity.js";

export class KnowledgeGraph {
  private baseDir: string;

  constructor(customDir?: string) {
    this.baseDir = customDir || path.join(os.homedir(), ".hiru", "memory", "knowledge");
    fs.ensureDirSync(this.baseDir);
  }

  public async upsertEntity(category: string, entity: KnowledgeEntity): Promise<void> {
    const validated = KnowledgeEntitySchema.parse(entity);
    const categoryDir = path.join(this.baseDir, category);
    await fs.ensureDir(categoryDir);
    
    const filePath = path.join(categoryDir, `${entity.id}.md`);
    
    let content = "---\n";
    content += `id: ${validated.id}\n`;
    content += `name: ${validated.name}\n`;
    content += `type: ${validated.type}\n`;
    content += `tags: ${validated.tags.join(", ")}\n`;
    content += `updatedAt: ${new Date().toISOString()}\n`;
    content += "---\n\n";
    content += validated.content;

    await fs.writeFile(filePath, content);
  }

  public async getEntity(category: string, id: string): Promise<KnowledgeEntity | null> {
    const filePath = path.join(this.baseDir, category, `${id}.md`);
    if (!(await fs.pathExists(filePath))) return null;
    
    const raw = await fs.readFile(filePath, "utf8");
    // Simplified parsing logic for frontmatter
    const parts = raw.split("---\n");
    if (parts.length < 3) return null;
    
    return {
      id,
      name: id, // Extracted from file
      type: "fact",
      tags: [],
      content: parts[2].trim(),
    };
  }

  public async listByCategory(category: string): Promise<string[]> {
    const categoryDir = path.join(this.baseDir, category);
    if (!(await fs.pathExists(categoryDir))) return [];
    const files = await fs.readdir(categoryDir);
    return files.filter(f => f.endsWith(".md")).map(f => f.replace(".md", ""));
  }
}
