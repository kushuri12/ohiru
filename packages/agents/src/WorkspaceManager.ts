import fs from "fs-extra";
import path from "path";
import chalk from "chalk";
import yaml from "yaml";

export class WorkspaceManager {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  public async createWorkspace(id: string, name: string): Promise<string> {
    const wsDir = path.join(this.baseDir, id);
    if (await fs.pathExists(wsDir)) {
      throw new Error(`Workspace ${id} already exists`);
    }

    await fs.ensureDir(wsDir);
    
    // Create default config
    const config = {
      id,
      name,
      soul: "./SOUL.md",
      workspace: "./project",
      memory: { namespace: id },
      channels: [],
      skills: []
    };

    await fs.writeFile(path.join(wsDir, "config.yaml"), yaml.stringify(config));
    
    // Initial SOUL.md
    const soulContent = `# ${name}\n\nYou are a helpful AI assistant.\n`;
    await fs.writeFile(path.join(wsDir, "SOUL.md"), soulContent);

    // Initial project dir
    await fs.ensureDir(path.join(wsDir, "project"));

    console.log(chalk.green(`[Workspace] Created workspace for ${name} at ${wsDir}`));
    return wsDir;
  }

  public async deleteWorkspace(id: string): Promise<void> {
    const wsDir = path.join(this.baseDir, id);
    await fs.remove(wsDir);
    console.log(chalk.yellow(`[Workspace] Deleted workspace ${id}`));
  }
}
