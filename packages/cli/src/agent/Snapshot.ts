// packages/cli/src/agent/Snapshot.ts
import { execa } from "execa";
import { ProjectContext } from "shared";

/**
 * Snapshot: Gathers real-time project environment state (Git).
 * Now with caching to avoid running git commands on every single request.
 */
export class ProjectSnapshot {
  private static cache: { root: string; snapshot: string; timestamp: number } | null = null;
  private static readonly CACHE_TTL_MS = 60_000; // Cache for 60 seconds

  static async get(ctx: ProjectContext): Promise<string> {
    const root = ctx.root;
    const now = Date.now();

    // Return cached snapshot if still fresh
    if (
      this.cache &&
      this.cache.root === root &&
      now - this.cache.timestamp < this.CACHE_TTL_MS
    ) {
      return this.cache.snapshot;
    }

    try {
      // Git status (compact)
      const { stdout: status } = await execa("git", ["status", "--short"], { cwd: root, reject: false, timeout: 5000 });
      const { stdout: recent } = await execa("git", ["log", "-n", "2", "--pretty=format:%h %s (%cr)"], { cwd: root, reject: false, timeout: 5000 });

      // Compact snapshot — only essential info
      const lines: string[] = [`Branch: ${ctx.gitBranch || "main"}`];
      
      if (recent) lines.push(`Recent: ${recent.replace(/\n/g, " | ")}`);
      if (status && status.trim()) {
        // Only first 5 changed files to save tokens
        const changes = status.split("\n").filter(Boolean).slice(0, 5);
        lines.push(`Changes: ${changes.join(", ")}`);
        if (status.split("\n").filter(Boolean).length > 5) {
          lines.push(`(+${status.split("\n").filter(Boolean).length - 5} more files)`);
        }
      } else {
        lines.push("Working tree: clean");
      }

      const snapshot = lines.join("\n");
      this.cache = { root, snapshot, timestamp: now };
      return snapshot;
    } catch (e: any) {
      return `Snapshot unavailable: ${e.message}`;
    }
  }

  /** Invalidate the cache (e.g., after a git operation) */
  static invalidate() {
    this.cache = null;
  }
}
