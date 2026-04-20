import { z } from "zod";
import path from "path";
import os from "os";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { execSync } from "child_process";
import chalk from "chalk";

export const SkillManifestSchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string(),
  author: z.string(),
  repository: z.string().optional(),
  keywords: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  triggers: z.array(z.string()).default([]),
});

export type SkillManifest = z.infer<typeof SkillManifestSchema>;

export interface Skill {
  manifest: SkillManifest;
  path: string;
  loaded: boolean;
}

export const AGENTS_FILE = "AGENTS.md";
export const SOUL_FILE = "SOUL.md";
export const TOOLS_FILE = "TOOLS.md";

export class SkillsRegistry {
  private workspaceDir: string;
  private skillsDir: string;
  private bundledDir: string;
  private skills: Map<string, Skill> = new Map();

  constructor(workspaceDir?: string) {
    this.workspaceDir = workspaceDir || path.join(os.homedir(), ".hiru", "workspace");
    this.skillsDir = path.join(this.workspaceDir, "skills");
    this.bundledDir = path.join(process.cwd(), "skills");
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    mkdirSync(this.skillsDir, { recursive: true });
    if (existsSync(this.bundledDir)) {
      mkdirSync(this.bundledDir, { recursive: true });
    }
  }

  public async loadAll(): Promise<void> {
    await this.loadBundledSkills();
    await this.loadWorkspaceSkills();
  }

  private async loadBundledSkills(): Promise<void> {
    if (!existsSync(this.bundledDir)) return;
    
    for (const name of readdirSync(this.bundledDir)) {
      const skillPath = path.join(this.bundledDir, name);
      await this.loadSkill(name, skillPath, "bundled");
    }
  }

  private async loadWorkspaceSkills(): Promise<void> {
    if (!existsSync(this.skillsDir)) return;
    
    for (const name of readdirSync(this.skillsDir)) {
      const skillPath = path.join(this.skillsDir, name);
      await this.loadSkill(name, skillPath, "workspace");
    }
  }

  private async loadSkill(name: string, skillPath: string, type: "bundled" | "workspace"): Promise<void> {
    const manifestPath = path.join(skillPath, "SKILL.json");
    if (!existsSync(manifestPath)) {
      console.log(chalk.yellow(`[Skills] No manifest for ${name}, skipping`));
      return;
    }

    try {
      const raw = readFileSync(manifestPath, "utf-8");
      const manifest = SkillManifestSchema.parse(JSON.parse(raw));
      const skill: Skill = { manifest, path: skillPath, loaded: false };
      this.skills.set(name, skill);
      console.log(chalk.green(`[Skills] Loaded ${type} skill: ${name} v${manifest.version}`));
    } catch (err) {
      console.error(chalk.red(`[Skills] Failed to load ${name}:`), err);
    }
  }

  public getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  public listSkills(): SkillManifest[] {
    return Array.from(this.skills.values()).map(s => s.manifest);
  }

  public async install(name: string, version?: string): Promise<void> {
    console.log(chalk.cyan(`[Skills] Installing ${name}...`));
    
    const targetDir = path.join(this.skillsDir, name);
    mkdirSync(targetDir, { recursive: true });
    
    console.log(chalk.green(`[Skills] Installed ${name} to ${targetDir}`));
    await this.loadSkill(name, targetDir, "workspace");
  }

  public async uninstall(name: string): Promise<void> {
    console.log(chalk.cyan(`[Skills] Uninstalling ${name}...`));
    this.skills.delete(name);
  }

  public getTools(workspacePath: string): string[] {
    const toolsPath = path.join(workspacePath, TOOLS_FILE);
    if (!existsSync(toolsPath)) return [];
    
    try {
      const content = readFileSync(toolsPath, "utf-8");
      return content.split("\n").filter(line => line.trim());
    } catch {
      return [];
    }
  }

  public getSoul(workspacePath: string): string | null {
    const soulPath = path.join(workspacePath, SOUL_FILE);
    if (!existsSync(soulPath)) return null;
    
    try {
      return readFileSync(soulPath, "utf-8");
    } catch {
      return null;
    }
  }

  public getAgentsInstructions(workspacePath: string): string | null {
    const agentsPath = path.join(workspacePath, AGENTS_FILE);
    if (!existsSync(agentsPath)) return null;
    
    try {
      return readFileSync(agentsPath, "utf-8");
    } catch {
      return null;
    }
  }
}