import { AgentConfig } from "./AgentConfig.js";
import path from "path";

export class AgentSandbox {
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  public isPathAllowed(targetPath: string): boolean {
    const absoluteTarget = path.resolve(targetPath);
    const absoluteWorkspace = path.resolve(this.config.workspace);
    return absoluteTarget.startsWith(absoluteWorkspace);
  }

  public getEnv(): Record<string, string> {
    // Provide isolated environment variables
    return {
      HIRU_AGENT_ID: this.config.id,
      HIRU_WORKSPACE: this.config.workspace,
    };
  }

  public getPermissions(): string[] {
    // Define tool permissions for this specific agent
    return ["read_file", "write_file", "run_shell"];
  }
}
