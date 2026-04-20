import fs from "fs-extra";
import path from "path";
import os from "os";
import yaml from "yaml";
import chalk from "chalk";
import { AgentConfig, AgentConfigSchema } from "./AgentConfig.js";
import { WorkspaceManager } from "./WorkspaceManager.js";
import { AgentSandbox } from "./AgentSandbox.js";

export class AgentOrchestrator {
  private agentsDir: string;
  private activeAgents = new Map<string, any>();
  private workspaceManager: WorkspaceManager;

  constructor(customDir?: string) {
    this.agentsDir = customDir || path.join(os.homedir(), ".hiru", "agents");
    fs.ensureDirSync(this.agentsDir);
    this.workspaceManager = new WorkspaceManager(this.agentsDir);
  }

  public async loadAgents(): Promise<void> {
    const entries = await fs.readdir(this.agentsDir);
    for (const id of entries) {
      const configPath = path.join(this.agentsDir, id, "config.yaml");
      if (await fs.pathExists(configPath)) {
        try {
          const raw = await fs.readFile(configPath, "utf8");
          const config = AgentConfigSchema.parse(yaml.parse(raw));
          console.log(chalk.cyan(`[Orchestrator] Loaded agent: ${config.name} (${id})`));
        } catch (err) {
          console.error(chalk.red(`[Orchestrator] Failed to load agent ${id}:`), err);
        }
      }
    }
  }

  public async spawnAgent(id: string, AgentClass: any): Promise<any> {
    const configPath = path.join(this.agentsDir, id, "config.yaml");
    const raw = await fs.readFile(configPath, "utf8");
    const config = AgentConfigSchema.parse(yaml.parse(raw));

    const sandbox = new AgentSandbox(id, { mode: "host" });
    const agent = new AgentClass(id, sandbox);
    
    this.activeAgents.set(id, agent);
    return agent;
  }

  public getAgent(id: string): any {
    return this.activeAgents.get(id);
  }

  public async stopAgent(id: string): Promise<void> {
    const agent = this.activeAgents.get(id);
    if (agent) {
      await agent.stop();
      this.activeAgents.delete(id);
    }
  }

  public listAgents(): string[] {
    return Array.from(this.activeAgents.keys());
  }
}
