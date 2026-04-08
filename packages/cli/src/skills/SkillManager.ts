// src/skills/SkillManager.ts
import fs from "fs/promises";
import path from "path";
import os from "os";
import { z } from "zod";
import { EventEmitter } from "events";

export interface SkillMetadata {
  name: string;
  description: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  author: "ai" | "user";
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
  tags: string[];
  testResult?: { success: boolean; output: string; testedAt: string };
  fullDescription?: string; // Content of .md file
}

export interface LoadedSkill {
  metadata: SkillMetadata;
  execute: (args: any) => Promise<string>;
  filePath: string;
}

export class SkillManager extends EventEmitter {
  private skillsDir: string;
  private loadedSkills: Map<string, LoadedSkill> = new Map();

  constructor(customDir?: string) {
    super();
    // Default: ~/.hiru/skills/
    this.skillsDir = customDir || path.join(os.homedir(), ".hiru", "skills");
  }

  get dir(): string {
    return this.skillsDir;
  }

  /**
   * Initialize skills directory and load all existing skills
   */
  async init(): Promise<void> {
    await fs.mkdir(this.skillsDir, { recursive: true });
    await this.migrateLegacySkills(); // Optional: Support legacy format migration
    await this.loadAll();
  }

  /**
   * Migrate old skill format (files level) to new format (subdirectories)
   */
  private async migrateLegacySkills(): Promise<void> {
    try {
      const files = await fs.readdir(this.skillsDir);
      const metaFiles = files.filter(f => f.endsWith(".meta.json"));

      for (const metaFile of metaFiles) {
        const name = metaFile.replace(".meta.json", "");
        const legacyMetaPath = path.join(this.skillsDir, metaFile);
        const legacyCodePath = path.join(this.skillsDir, `${name}.skill.mjs`);

        const skillDir = path.join(this.skillsDir, name);
        await fs.mkdir(skillDir, { recursive: true });

        const newMetaPath = path.join(skillDir, `${name}.json`);
        const newCodePath = path.join(skillDir, `${name}.mjs`);
        const newMdPath = path.join(skillDir, `${name}.md`);

        // Read metadata for initial description
        try {
          const metaRaw = await fs.readFile(legacyMetaPath, "utf8");
          const metadata = JSON.parse(metaRaw);
          
          // Move metadata
          await fs.rename(legacyMetaPath, newMetaPath);
          
          // Move code
          if (await fs.access(legacyCodePath).then(() => true).catch(() => false)) {
            await fs.rename(legacyCodePath, newCodePath);
          }

          // Create initial .md file
          if (!(await fs.access(newMdPath).then(() => true).catch(() => false))) {
            const readme = `# Skill: ${name}\n\n${metadata.description}\n\n## Created\n${metadata.createdAt}\n`;
            await fs.writeFile(newMdPath, readme, "utf8");
          }
          
          console.log(`  📦 Migrated skill "${name}" to directory-based structure`);
        } catch (e) {
          console.error(`  ⚠️ Failed to migrate legacy skill "${name}":`, e);
        }
      }
    } catch {
      // No skills to migrate
    }
  }

  /**
   * Load all skills from disk
   */
  async loadAll(): Promise<void> {
    this.loadedSkills.clear();

    let entries: string[];
    try {
      const allEntries = await fs.readdir(this.skillsDir, { withFileTypes: true });
      entries = allEntries
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
    } catch {
      return;
    }

    for (const skillName of entries) {
      try {
        await this.loadOne(skillName);
      } catch (e: any) {
        console.error(`  ⚠️ Failed to load skill "${skillName}": ${e.message}`);
      }
    }

    if (this.loadedSkills.size > 0) {
      this.emit("loaded", this.loadedSkills.size);
    }
  }

  /**
   * Load a single skill by name
   */
  private async loadOne(name: string): Promise<LoadedSkill | null> {
    const skillDir = path.join(this.skillsDir, name);
    const metaPath = path.join(skillDir, `${name}.json`);
    const codePath = path.join(skillDir, `${name}.mjs`);
    const mdPath = path.join(skillDir, `${name}.md`);

    const [metaExists, codeExists] = await Promise.all([
      fs.access(metaPath).then(() => true).catch(() => false),
      fs.access(codePath).then(() => true).catch(() => false),
    ]);

    if (!metaExists || !codeExists) return null;

    const metaRaw = await fs.readFile(metaPath, "utf8");
    const metadata: SkillMetadata = JSON.parse(metaRaw);

    // Read full description if exists
    if (await fs.access(mdPath).then(() => true).catch(() => false)) {
      metadata.fullDescription = await fs.readFile(mdPath, "utf8");
    }

    // Dynamic import the skill module
    const fileUrl = `file:///${codePath.replace(/\\/g, "/")}`;
    const mod = await import(/* @vite-ignore */ fileUrl);
    const execute = mod.default || mod.execute;

    if (typeof execute !== "function") {
      throw new Error(`Skill "${name}" has no default export function`);
    }

    const skill: LoadedSkill = { metadata, execute, filePath: codePath };
    this.loadedSkills.set(name, skill);
    return skill;
  }

  /**
   * Create and save a new skill
   */
  async createSkill(
    name: string,
    description: string,
    parameters: SkillMetadata["parameters"],
    code: string,
    tags: string[] = [],
    fullDescription?: string
  ): Promise<{ success: boolean; error?: string }> {
    // Sanitize name
    const safeName = name.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
    const skillDir = path.join(this.skillsDir, safeName);

    const metadata: SkillMetadata = {
      name: safeName,
      description,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: "ai",
      parameters,
      tags,
    };

    const metaPath = path.join(skillDir, `${safeName}.json`);
    const codePath = path.join(skillDir, `${safeName}.mjs`);
    const mdPath = path.join(skillDir, `${safeName}.md`);

    // Create the skill directory
    await fs.mkdir(skillDir, { recursive: true });

    // Wrap the code in a proper ESM module
    const wrappedCode = `// Auto-generated Hiru skill: ${safeName}
// ${description}
// Created: ${metadata.createdAt}

${code}
`;

    // Create the markdown documentation
    const readme = fullDescription || `# Skill: ${safeName}

> ${description}

## Description
This is a dynamic skill created for Hiru. 

## Requirements
- Parameters: \`${Object.keys(parameters).join(", ") || "None"}\`
- Tags: \`${tags.join(", ") || "None"}\`

## Usage Instructions
Hiru can call this skill using \`skill_${safeName}\`.

---
*Created by Hiru on ${new Date().toLocaleDateString()}*
`;

    try {
      await fs.writeFile(codePath, wrappedCode, "utf8");
      await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), "utf8");
      await fs.writeFile(mdPath, readme, "utf8");

      // Try to load it immediately
      const skill = await this.loadOne(safeName);
      if (!skill) {
        return { success: false, error: "Skill saved but failed to load" };
      }

      this.emit("skillCreated", safeName, metadata);
      return { success: true };
    } catch (e: any) {
      // Cleanup on failure
      await fs.rm(skillDir, { recursive: true, force: true }).catch(() => {});
      return { success: false, error: e.message };
    }
  }

  /**
   * Test a skill by running it with sample args
   */
  async testSkill(name: string, testArgs: any): Promise<{ success: boolean; output: string }> {
    const skill = this.loadedSkills.get(name);
    if (!skill) {
      return { success: false, output: `Skill "${name}" not found` };
    }

    try {
      const result = await Promise.race([
        skill.execute(testArgs),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("Skill test timed out after 15s")), 15000)
        ),
      ]);

      // Save test result
      skill.metadata.testResult = {
        success: true,
        output: String(result).slice(0, 500),
        testedAt: new Date().toISOString(),
      };
      await this.saveMetadata(name, skill.metadata);

      return { success: true, output: String(result) };
    } catch (e: any) {
      skill.metadata.testResult = {
        success: false,
        output: e.message,
        testedAt: new Date().toISOString(),
      };
      await this.saveMetadata(name, skill.metadata);

      return { success: false, output: e.message };
    }
  }

  /**
   * Update a skill's code (for fixing errors)
   */
  async updateSkillCode(name: string, newCode: string): Promise<{ success: boolean; error?: string }> {
    const skill = this.loadedSkills.get(name);
    if (!skill) {
      return { success: false, error: `Skill "${name}" not found` };
    }

    const skillDir = path.join(this.skillsDir, name);
    const codePath = path.join(skillDir, `${name}.mjs`);
    const backupPath = codePath + ".bak";

    try {
      // Backup previous version
      const oldCode = await fs.readFile(codePath, "utf8");
      await fs.writeFile(backupPath, oldCode, "utf8");

      // Write new code
      const wrappedCode = `// Auto-generated Hiru skill: ${name}
// ${skill.metadata.description}
// Updated: ${new Date().toISOString()} (v${skill.metadata.version + 1})

${newCode}
`;
      await fs.writeFile(codePath, wrappedCode, "utf8");

      // Bump version
      skill.metadata.version++;
      skill.metadata.updatedAt = new Date().toISOString();
      await this.saveMetadata(name, skill.metadata);

      // Reload to validate
      this.loadedSkills.delete(name);
      const reloaded = await this.loadOne(name);
      if (!reloaded) {
        // Rollback
        await fs.writeFile(codePath, oldCode, "utf8");
        return { success: false, error: "Updated code failed to load, rolled back" };
      }

      // Cleanup backup on success
      await fs.unlink(backupPath).catch(() => {});

      this.emit("skillUpdated", name, skill.metadata);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Delete a skill
   */
  async deleteSkill(name: string): Promise<boolean> {
    const skillDir = path.join(this.skillsDir, name);
    await fs.rm(skillDir, { recursive: true, force: true }).catch(() => {});
    this.loadedSkills.delete(name);
    this.emit("skillDeleted", name);
    return true;
  }

  /**
   * List all loaded skills
   */
  listSkills(): SkillMetadata[] {
    return Array.from(this.loadedSkills.values()).map(s => s.metadata);
  }

  /**
   * Get all loaded skills as tool definitions (for AI SDK)
   */
  getToolDefinitions(): Record<string, any> {
    const tools: Record<string, any> = {};

    for (const [name, skill] of this.loadedSkills) {
      // Build zod schema from metadata parameters
      const zodShape: Record<string, any> = {};
      for (const [paramName, paramDef] of Object.entries(skill.metadata.parameters)) {
        let zodType: any;
        switch (paramDef.type) {
          case "number": zodType = z.number(); break;
          case "boolean": zodType = z.boolean(); break;
          case "array": zodType = z.array(z.string()); break;
          default: zodType = z.string(); break;
        }
        zodType = zodType.describe(paramDef.description);
        if (!paramDef.required) zodType = zodType.optional();
        zodShape[paramName] = zodType;
      }

      tools[`skill_${name}`] = {
        description: `[SKILL] ${skill.metadata.description}`,
        parameters: z.object(zodShape),
        execute: skill.execute,
      };
    }

    return tools;
  }

  private async saveMetadata(name: string, metadata: SkillMetadata): Promise<void> {
    const metaPath = path.join(this.skillsDir, name, `${name}.json`);
    await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), "utf8");
  }
}
