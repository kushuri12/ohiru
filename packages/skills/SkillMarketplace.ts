import fetch from "node-fetch";
import chalk from "chalk";

export interface SkillManifest {
  name: string;
  description: string;
  version: string;
  author: string;
  repository: string;
}

export class SkillMarketplace {
  private registryUrl: string = "https://raw.githubusercontent.com/kushuri12/hiru-skills/main/registry.json";

  public async search(query: string): Promise<SkillManifest[]> {
    console.log(chalk.gray(`[Marketplace] Searching for "${query}"...`));
    const response = await fetch(this.registryUrl);
    const registry: any = await response.json();
    
    return registry.skills.filter((s: SkillManifest) => 
      s.name.includes(query) || s.description.includes(query)
    );
  }

  public async install(name: string): Promise<void> {
    console.log(chalk.cyan(`[Marketplace] Installing skill: ${name}...`));
    // Fetch skill JSON from repository and save to local library
  }
}
