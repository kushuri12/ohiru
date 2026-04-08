// packages/cli/src/agent/Snapshot.ts
import { execa } from "execa";
import { ProjectContext } from "shared";
import path from "path";

/**
 * Snapshot: Gathers real-time project environment state (Git, FileTree)
 * Inspired by Claude Code's project state detection.
 */
export class ProjectSnapshot {
  static async get(ctx: ProjectContext): Promise<string> {
    const root = ctx.root;
    
    try {
      // 1. Git Status (Recent 3 commits + Diff)
      const { stdout: status } = await execa("git", ["status", "--short"], { cwd: root, reject: false });
      const { stdout: recent } = await execa("git", ["log", "-n", "3", "--pretty=format:%h - %s (%cr)"], { cwd: root, reject: false });
      const { stdout: diff } = await execa("git", ["diff", "--stat"], { cwd: root, reject: false });

      // 2. File Tree Summary (Top level + deep check for src/)
      const { stdout: tree } = await execa("ls", ["-R", "|", "grep", "\':$\'", "|", "head", "-n", "20"], { shell: true, cwd: root, reject: false });

      // 3. Health Check (Passive Feedback - Inspired by Claude Code)
      let health = "No automated check detected.";
      const { stdout: pkgJson } = await execa("ls", ["package.json"], { cwd: root, reject: false });
      if (pkgJson) {
         // Fast-check for critical syntax/type errors (Limited to 1s to prevent UI blocking)
         try {
           const { stdout: tscResult } = await execa("npx", ["tsc", "--noEmit"], { cwd: root, reject: false, timeout: 1000 });
           health = tscResult.includes("Found 0 errors") ? "🚀 Clean (No TS errors)" : `⚠️ Potential Errors:\n${tscResult.slice(0, 500)}`;
         } catch (e) {
           health = "⏱️ Check timed out (Snapshot skipped for speed)";
         }
      }

      return `
### PROJECT SNAPSHOT (Current Awareness)
- **Branch**: ${ctx.gitBranch || "main"}
- **Recent Git History**:
${recent || "None"}

- **Uncommitted Changes**:
${status || "None (Clean)"}
${diff ? `\n- **Diff Stat**:\n${diff}` : ""}

- **Project Structure (Summary)**:
${tree || "Not available"}

- **Project Health (Status)**:
${health}
`;
    } catch (e: any) {
      return `### PROJECT SNAPSHOT\nFailed to gather state: ${e.message}`;
    }
  }
}
