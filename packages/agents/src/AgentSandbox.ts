import { spawn, exec } from "child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import path from "path";
import os from "os";
import chalk from "chalk";
import { randomBytes } from "crypto";

export interface SandboxConfig {
  mode: "host" | "docker" | "podman";
  image?: string;
  networks?: string[];
  allowedTools?: string[];
  deniedTools?: string[];
  memoryLimit?: string;
  cpuLimit?: string;
}

export interface SessionSandbox {
  sessionId: string;
  containerId?: string;
  config: SandboxConfig;
  running: boolean;
}

const DEFAULT_TOOLS_HOST = ["bash", "process", "read", "write", "edit", "sessions_*"];
const DEFAULT_TOOLS_DENIED = ["browser", "canvas", "nodes", "cron"];

export class AgentSandbox {
  private config: SandboxConfig;
  private sessionId: string;
  private containerId: string | null = null;
  private running: boolean = false;

  constructor(sessionId: string, config?: Partial<SandboxConfig>) {
    this.sessionId = sessionId;
    this.config = {
      mode: config?.mode || "host",
      image: config?.image || "node:24-alpine",
      networks: config?.networks || ["bridge"],
      allowedTools: config?.allowedTools || DEFAULT_TOOLS_HOST,
      deniedTools: config?.deniedTools || DEFAULT_TOOLS_DENIED,
      memoryLimit: config?.memoryLimit || "512m",
      cpuLimit: config?.cpuLimit || "0.5",
    };
  }

  public async start(): Promise<boolean> {
    if (this.config.mode === "host") {
      console.log(chalk.cyan(`[Sandbox] Using host mode for session ${this.sessionId}`));
      this.running = true;
      return true;
    }

    try {
      const containerName = `hiru_sandbox_${this.sessionId}`;
      const cmd = this.config.mode === "podman" ? "podman" : "docker";

      const args = [
        "run", "-d",
        "--name", containerName,
        "--memory", this.config.memoryLimit!,
        "--cpus", this.config.cpuLimit!,
        "--network", this.config.networks?.[0] || "none",
        "-v", `${os.homedir()}/.hiru/workspace:/workspace`,
        "-w", "/workspace",
        this.config.image!
      ];

      await exec(`${cmd} ${args.join(" ")}`);

      this.containerId = containerName;
      this.running = true;
      console.log(chalk.green(`[Sandbox] Container ${containerName} started`));
      return true;
    } catch (err) {
      console.error(chalk.red(`[Sandbox] Failed to start:`), err);
      return false;
    }
  }

  public async execute(command: string, env?: Record<string, string>): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (this.config.mode === "host") {
      return this.executeHost(command, env);
    }
    return this.executeContainer(command, env);
  }

  private async executeHost(command: string, env?: Record<string, string>): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const proc = spawn("sh", ["-c", command], {
        env: { ...process.env, ...env },
        cwd: path.join(os.homedir(), ".hiru", "workspace")
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data) => { stdout += data.toString(); });
      proc.stderr?.on("data", (data) => { stderr += data.toString(); });

      proc.on("close", (code) => {
        resolve({ stdout, stderr, exitCode: code || 0 });
      });
    });
  }

  private async executeContainer(command: string, env?: Record<string, string>): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (!this.containerId) {
      return { stdout: "", stderr: "Container not running", exitCode: 1 };
    }

    const cmd = this.config.mode === "podman" ? "podman" : "docker";
    return new Promise((resolve) => {
      exec(`${cmd} exec ${this.containerId} sh -c "${command}"`, (err, stdout, stderr) => {
        resolve({
          stdout: stdout || "",
          stderr: stderr || "",
          exitCode: err ? 1 : 0
        });
      });
    });
  }

  public async stop(): Promise<void> {
    if (!this.containerId) return;

    const cmd = this.config.mode === "podman" ? "podman" : "docker";
    await exec(`${cmd} stop ${this.containerId}`);
    await exec(`${cmd} rm ${this.containerId}`);
    this.containerId = null;
    this.running = false;
    console.log(chalk.green(`[Sandbox] Container stopped`));
  }

  public isAllowed(tool: string): boolean {
    if (this.config.deniedTools?.includes(tool)) {
      return false;
    }
    if (this.config.allowedTools && this.config.allowedTools.length > 0) {
      return this.config.allowedTools.includes(tool);
    }
    return true;
  }

  public isRunning(): boolean {
    return this.running;
  }

  public getSessionId(): string {
    return this.sessionId;
  }
}

export class SandboxManager {
  private sandboxes: Map<string, AgentSandbox> = new Map();
  private defaultConfig: Partial<SandboxConfig>;

  constructor(defaultConfig?: Partial<SandboxConfig>) {
    this.defaultConfig = defaultConfig || {};
  }

  public create(sessionId: string, config?: Partial<SandboxConfig>): AgentSandbox {
    const sandbox = new AgentSandbox(sessionId, { ...this.defaultConfig, ...config });
    this.sandboxes.set(sessionId, sandbox);
    return sandbox;
  }

  public get(sessionId: string): AgentSandbox | undefined {
    return this.sandboxes.get(sessionId);
  }

  public async remove(sessionId: string): Promise<void> {
    const sandbox = this.sandboxes.get(sessionId);
    if (sandbox) {
      await sandbox.stop();
      this.sandboxes.delete(sessionId);
    }
  }

  public async stopAll(): Promise<void> {
    for (const sandbox of this.sandboxes.values()) {
      await sandbox.stop();
    }
    this.sandboxes.clear();
  }
}