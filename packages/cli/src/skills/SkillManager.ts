import { execa } from "execa";
import fs from "fs-extra";
import path from "path";
import os from "os";
import chalk from "chalk";
import { z } from "zod";
import { EventEmitter } from "events";
import { SkillVersionManager } from "./SkillVersionManager.js";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

/** A single file inside a multi-file skill */
export interface SkillFile {
  /** Filename with extension, e.g. "main.py", "config.json", "helpers.js" */
  filename: string;
  /** File content */
  content: string;
  /** Language hint (auto-detected from extension if omitted) */
  language?: string;
}

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

  /**
   * The main entry-point file inside the skill folder.
   * If omitted, falls back to `<name>.mjs` (legacy) or the first
   * executable file found (.mjs → .js → .py → .ts → .sh → .bat → .ps1).
   */
  main?: string;

  /**
   * All files that belong to this skill (excluding the auto-generated
   * metadata .json and readme .md, which are managed by the system).
   */
  files?: string[];
}

export interface LoadedSkill {
  metadata: SkillMetadata;
  execute: (args: any) => Promise<string>;
  filePath: string;
}

// ─────────────────────────────────────────────────────────────
// Language runtime resolution
// ─────────────────────────────────────────────────────────────

/** Maps file extension → command to run that file. `null` = dynamic import (ESM). */
const RUNTIME_MAP: Record<string, string | null> = {
  ".mjs": null,           // Native ES module import
  ".js":  null,           // Native ES module import
  ".cjs": null,           // CommonJS → dynamic import
  ".py":  "python",       // Python 3
  ".ts":  "npx tsx",      // TypeScript via tsx
  ".sh":  "bash",         // Shell script
  ".bat": "cmd /c",       // Windows batch
  ".ps1": "powershell -ExecutionPolicy Bypass -File", // PowerShell
  ".rb":  "ruby",         // Ruby
  ".php": "php",          // PHP
  ".lua": "lua",          // Lua
  ".pl":  "perl",         // Perl
  ".go":  "go run",       // Go (single file)
};

/** Get the runtime command for a file extension. Returns null for native JS import. */
function getRuntimeForExt(ext: string): string | null | undefined {
  return RUNTIME_MAP[ext.toLowerCase()];
}

/** Detect language from file extension */
function detectLanguage(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const languageMap: Record<string, string> = {
    ".py": "python", ".js": "javascript", ".mjs": "javascript",
    ".cjs": "javascript", ".ts": "typescript", ".sh": "shell",
    ".bat": "batch", ".ps1": "powershell", ".rb": "ruby",
    ".php": "php", ".lua": "lua", ".pl": "perl", ".go": "go",
    ".json": "json", ".md": "markdown", ".yaml": "yaml",
    ".yml": "yaml", ".toml": "toml", ".xml": "xml",
    ".html": "html", ".css": "css", ".sql": "sql",
    ".r": "r", ".rs": "rust", ".java": "java",
    ".kt": "kotlin", ".swift": "swift", ".c": "c",
    ".cpp": "cpp", ".h": "c-header", ".cs": "csharp",
  };
  return languageMap[ext] || ext.replace(".", "");
}

/** Priority order for auto-detecting the main entry file */
const MAIN_FILE_PRIORITY = [".mjs", ".js", ".py", ".ts", ".sh", ".bat", ".ps1", ".rb", ".php"];

// ─────────────────────────────────────────────────────────────
// SkillManager
// ─────────────────────────────────────────────────────────────

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
    // Auto-prune stale versions without blocking startup.
    this.pruneOldVersions(false).catch(() => {});
  }

  /**
   * Prune old versions of skills from the library directory.
   */
  async prune(dryRun: boolean = true): Promise<{ deleted: string[]; kept: string[] }> {
    const versionManager = new SkillVersionManager(this.skillsDir);
    return await versionManager.pruneOldVersions(dryRun);
  }

  async pruneOldVersions(dryRun: boolean = true): Promise<{ deleted: string[]; kept: string[] }> {
    return this.prune(dryRun);
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

    const versionManager = new SkillVersionManager(this.skillsDir);
    const latestVersions = await versionManager.getLatestVersions();
    
    // 1. Load versioned flat skills (Library style)
    for (const [baseName, jsonPath] of latestVersions.entries()) {
      try {
        await this.loadOne(baseName, jsonPath);
      } catch (e: any) {
        console.error(`  ⚠️ Failed to load library skill "${baseName}": ${e.message}`);
      }
    }

    // 2. Load directory-based skills (User style)
    try {
      const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
      const folders = entries.filter(e => e.isDirectory()).map(e => e.name);
      
      for (const folderName of folders) {
        // Skip if already loaded as a versioned skill (unlikely but safe)
        if (this.loadedSkills.has(folderName)) continue;
        
        try {
          await this.loadOne(folderName);
        } catch (e: any) {
          // Silent for folders that aren't actually skills
        }
      }
    } catch {
      // Ignore readdir errors
    }

    if (this.loadedSkills.size > 0) {
      this.emit("loaded", this.loadedSkills.size);
    }
  }

  /**
   * Load a single skill by name (supports multi-file, multi-language skills)
   * @param name The name of the skill
   * @param flatJsonPath If provided, loads as a flat versioned skill from this JSON path
   */
  private async loadOne(name: string, flatJsonPath?: string): Promise<LoadedSkill | null> {
    const isFlat = !!flatJsonPath;
    const skillDir = isFlat ? path.dirname(flatJsonPath) : path.join(this.skillsDir, name);
    const metaPath = isFlat ? flatJsonPath : path.join(skillDir, `${name}.json`);
    const mdPath = isFlat ? metaPath.replace(".json", ".md") : path.join(skillDir, `${name}.md`);

    // metadata.json MUST exist
    const metaExists = await fs.access(metaPath).then(() => true).catch(() => false);
    if (!metaExists) return null;

    const metaRaw = await fs.readFile(metaPath, "utf8");
    const metadata: SkillMetadata = JSON.parse(metaRaw);

    // Read full description if exists
    if (await fs.access(mdPath).then(() => true).catch(() => false)) {
      metadata.fullDescription = await fs.readFile(mdPath, "utf8");
    }

    // ── Determine the main entry file ──────────────────────
    let mainFile = metadata.main;
    
    if (!mainFile) {
      // Legacy: try <name>.mjs
      const legacyPath = path.join(skillDir, `${name}.mjs`);
      if (await fs.access(legacyPath).then(() => true).catch(() => false)) {
        mainFile = `${name}.mjs`;
      } else {
        const discoveryBase = isFlat ? path.basename(metaPath, ".json") : name;
        const dirFiles = await fs.readdir(skillDir);
        for (const ext of MAIN_FILE_PRIORITY) {
          const candidate = dirFiles.find(f => f.toLowerCase() === `${discoveryBase}${ext}`);
          if (candidate) {
            mainFile = candidate;
            break;
          }
        }
      }
    }

    if (!mainFile) {
      throw new Error(`Skill "${name}" has no recognizable entry file`);
    }

    const mainPath = path.join(skillDir, mainFile);
    const mainExt = path.extname(mainFile).toLowerCase();
    const runtime = getRuntimeForExt(mainExt);

    let execute: (args: any) => Promise<string>;

    if (runtime === null) {
      // ── Native JS/ESM import ────────────────────────
      const fileUrl = `file:///${mainPath.replace(/\\/g, "/")}`;
      
      // Cache-busting for hot reload
      const mod = await import(`${fileUrl}?update=${Date.now()}`);
      const fn = mod.default || mod.execute;

      if (typeof fn !== "function") {
        throw new Error(`Skill "${name}" main file (${mainFile}) has no default export function`);
      }
      execute = fn;
    } else if (runtime === undefined) {
      // Unknown extension — not executable, skip
      throw new Error(`Skill "${name}" main file "${mainFile}" has unsupported extension "${mainExt}"`);
    } else {
      // ── External runtime (Python, Shell, etc.) ──────
      execute = this.createExternalExecutor(name, mainPath, runtime, skillDir);
    }

    const skill: LoadedSkill = { metadata, execute, filePath: mainPath };
    this.loadedSkills.set(name, skill);
    return skill;
  }

  /**
   * Create an executor function that runs a skill file via an external runtime.
   * Arguments are passed as a JSON string via stdin and environment variable SKILL_ARGS.
   * The script's stdout is captured as the return value.
   */
  private createExternalExecutor(
    name: string,
    mainPath: string,
    runtime: string,
    skillDir: string
  ): (args: any) => Promise<string> {
    return async (args: any): Promise<string> => {
      const argsJson = JSON.stringify(args);

      try {
        const result = await execa(
          `${runtime} "${mainPath}"`,
          {
            shell: true,
            cwd: skillDir,
            timeout: 30000,
            reject: false,
            input: argsJson,
            env: {
              ...process.env,
              SKILL_ARGS: argsJson,
              SKILL_NAME: name,
              SKILL_DIR: skillDir,
            },
          }
        );

        if (result.exitCode !== 0) {
          const stderr = (result.stderr || "").trim();
          throw new Error(
            `Skill "${name}" exited with code ${result.exitCode}${stderr ? `: ${stderr}` : ""}`
          );
        }

        return (result.stdout || "").trim() || "(no output)";
      } catch (e: any) {
        if (e.timedOut) {
          throw new Error(`Skill "${name}" timed out after 30s`);
        }
        throw e;
      }
    };
  }

  /**
   * Create and save a new skill — supports multi-file, multi-language.
   *
   * @param name          Skill name (sanitized automatically)
   * @param description   Short description
   * @param parameters    Parameter definitions
   * @param code          Main entry-point code (for single-file or legacy compat)
   * @param tags          Tags
   * @param fullDescription  Full markdown documentation
   * @param extraFiles    Additional files to include (e.g. helpers, configs)
   * @param mainFilename  Custom main filename (e.g. "main.py" instead of "<name>.mjs")
   */
  async createSkill(
    name: string,
    description: string,
    parameters: SkillMetadata["parameters"],
    code: string,
    tags: string[] = [],
    fullDescription?: string,
    extraFiles?: SkillFile[],
    mainFilename?: string,
  ): Promise<{ success: boolean; error?: string }> {
    // Sanitize name
    const safeName = name.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
    const skillDir = path.join(this.skillsDir, safeName);

    // Determine the main file name
    const resolvedMainFilename = mainFilename || `${safeName}.mjs`;
    const mainExt = path.extname(resolvedMainFilename);

    // Build the list of all files
    const allFileNames: string[] = [resolvedMainFilename];
    if (extraFiles) {
      for (const ef of extraFiles) {
        if (!allFileNames.includes(ef.filename)) {
          allFileNames.push(ef.filename);
        }
      }
    }

    const metadata: SkillMetadata = {
      name: safeName,
      description,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: "ai",
      parameters,
      tags,
      main: resolvedMainFilename,
      files: allFileNames,
    };

    const metaPath = path.join(skillDir, `${safeName}.json`);
    const mainPath = path.join(skillDir, resolvedMainFilename);
    const mdPath = path.join(skillDir, `${safeName}.md`);

    // Create the skill directory
    await fs.mkdir(skillDir, { recursive: true });

    // ── Wrap the main code ────────────────────────────────
    const lang = detectLanguage(resolvedMainFilename);
    const commentStyle = this.getCommentPrefix(lang);
    const wrappedCode = `${commentStyle} Auto-generated Hiru skill: ${safeName}
${commentStyle} ${description}
${commentStyle} Created: ${metadata.createdAt}

${code}
`;

    // ── Create the markdown documentation ─────────────────
    const filesList = allFileNames.map(f => `- \`${f}\` (${detectLanguage(f)})`).join("\n");
    const readme = fullDescription || `# Skill: ${safeName}

> ${description}

## Description
This is a dynamic multi-file skill created for Hiru. 

## Files
${filesList}

## Entry Point
\`${resolvedMainFilename}\` (${lang})

## Requirements
- Parameters: \`${Object.keys(parameters).join(", ") || "None"}\`
- Tags: \`${tags.join(", ") || "None"}\`

## Usage Instructions
Hiru can call this skill using \`skill_${safeName}\`.

---
*Created by Hiru on ${new Date().toLocaleDateString()}*
`;

    try {
      // Write main code file
      await fs.writeFile(mainPath, wrappedCode, "utf8");

      // Write metadata
      await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), "utf8");

      // Write markdown documentation
      await fs.writeFile(mdPath, readme, "utf8");

      // Write extra files
      if (extraFiles && extraFiles.length > 0) {
        for (const ef of extraFiles) {
          // Prevent path traversal
          const safeFn = path.basename(ef.filename);
          const efPath = path.join(skillDir, safeFn);
          await fs.writeFile(efPath, ef.content, "utf8");
        }
      }

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
   * Update a skill's main code (for fixing errors)
   */
  async updateSkillCode(name: string, newCode: string): Promise<{ success: boolean; error?: string }> {
    const skill = this.loadedSkills.get(name);
    if (!skill) {
      return { success: false, error: `Skill "${name}" not found` };
    }

    const skillDir = path.join(this.skillsDir, name);
    const codePath = skill.filePath; // Points to the actual main file
    const backupPath = codePath + ".bak";

    try {
      // Backup previous version
      const oldCode = await fs.readFile(codePath, "utf8");
      await fs.writeFile(backupPath, oldCode, "utf8");

      // Write new code
      const lang = detectLanguage(path.basename(codePath));
      const commentStyle = this.getCommentPrefix(lang);
      const wrappedCode = `${commentStyle} Auto-generated Hiru skill: ${name}
${commentStyle} ${skill.metadata.description}
${commentStyle} Updated: ${new Date().toISOString()} (v${skill.metadata.version + 1})

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
   * Update or add an extra file inside a skill folder
   */
  async updateSkillFile(
    skillName: string,
    filename: string,
    content: string
  ): Promise<{ success: boolean; error?: string }> {
    const skill = this.loadedSkills.get(skillName);
    if (!skill) {
      return { success: false, error: `Skill "${skillName}" not found` };
    }

    const skillDir = path.join(this.skillsDir, skillName);
    const safeFn = path.basename(filename);
    const filePath = path.join(skillDir, safeFn);

    try {
      await fs.writeFile(filePath, content, "utf8");

      // Update metadata files list
      if (!skill.metadata.files?.includes(safeFn)) {
        skill.metadata.files = skill.metadata.files || [];
        skill.metadata.files.push(safeFn);
        skill.metadata.updatedAt = new Date().toISOString();
        await this.saveMetadata(skillName, skill.metadata);
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  /**
   * List all files inside a skill folder
   */
  async listSkillFiles(skillName: string): Promise<{ files: Array<{ name: string; language: string; size: number }> } | { error: string }> {
    const skillDir = path.join(this.skillsDir, skillName);
    
    try {
      const entries = await fs.readdir(skillDir);
      const fileInfos = await Promise.all(
        entries.map(async (f) => {
          const stat = await fs.stat(path.join(skillDir, f));
          return {
            name: f,
            language: detectLanguage(f),
            size: stat.size,
          };
        })
      );
      return { files: fileInfos };
    } catch (e: any) {
      return { error: `Could not list files for skill "${skillName}": ${e.message}` };
    }
  }

  /**
   * Read all source files in a skill folder (for AI to inspect before fixing).
   * Returns concatenated content of all non-metadata files.
   */
  async readSkillFiles(skillName: string): Promise<{ content: string } | { error: string }> {
    const skillDir = path.join(this.skillsDir, skillName);
    
    try {
      const entries = await fs.readdir(skillDir);
      const sections: string[] = [`## Skill: ${skillName}\n`];
      
      for (const filename of entries) {
        const filePath = path.join(skillDir, filename);
        const stat = await fs.stat(filePath);
        if (stat.isDirectory()) continue;
        
        const content = await fs.readFile(filePath, "utf8");
        const lang = detectLanguage(filename);
        sections.push(`### ${filename} (${lang})\n\`\`\`${lang}\n${content}\n\`\`\``);
      }
      
      return { content: sections.join("\n\n") };
    } catch (e: any) {
      return { error: `Could not read skill "${skillName}": ${e.message}` };
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

      const langInfo = skill.metadata.main
        ? ` [${detectLanguage(skill.metadata.main)}]`
        : "";

      tools[`skill_${name}`] = {
        description: `[SKILL]${langInfo} ${skill.metadata.description}`,
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

  /** Get the single-line comment prefix for a language */
  private getCommentPrefix(lang: string): string {
    const map: Record<string, string> = {
      python: "#",
      ruby: "#",
      perl: "#",
      shell: "#",
      powershell: "#",
      yaml: "#",
      r: "#",
      lua: "--",
      sql: "--",
      batch: "REM",
      html: "<!--",
      css: "/*",
      c: "//",
      cpp: "//",
      csharp: "//",
      java: "//",
      kotlin: "//",
      swift: "//",
      go: "//",
      rust: "//",
      javascript: "//",
      typescript: "//",
      php: "//",
    };
    return map[lang] || "//";
  }
}
