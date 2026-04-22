import fs from "fs-extra";
import path from "path";
import { ProjectContext } from "shared";
import { execa } from "execa";

export async function detectProjectContext(root: string): Promise<ProjectContext> {
  let openHiruMDContent = "";
  try {
    openHiruMDContent = await fs.readFile(path.join(root, "OPENHIRU.md"), "utf-8");
  } catch (e) {
    // OPENHIRU.md does not exist yet
  }

  let packageManager = "npm";
  let framework = "Node.js";
  let primaryLanguage = "TypeScript";

  try {
    const files = await fs.readdir(root);
    if (files.includes("pnpm-lock.yaml")) packageManager = "pnpm";
    else if (files.includes("yarn.lock")) packageManager = "yarn";
    else if (files.includes("bun.lockb")) packageManager = "bun";

    if (files.includes("next.config.js") || files.includes("next.config.mjs")) framework = "Next.js";
    else if (files.includes("vite.config.ts")) framework = "Vite";
    else if (files.includes("manage.py")) {
      primaryLanguage = "Python";
      framework = "Django";
      packageManager = "pip";
    }
  } catch(e) {}

  let gitBranch = "unknown";
  let recentCommits: string[] = [];

  try {
    const branchRes = await execa("git", ["branch", "--show-current"], { cwd: root });
    gitBranch = branchRes.stdout.trim();

    const commitsRes = await execa("git", ["log", "-n", "3", "--oneline"], { cwd: root });
    recentCommits = commitsRes.stdout.split("\n").filter(Boolean);
  } catch(e) {
    // Not a git repo
  }

  return {
    root,
    primaryLanguage,
    framework,
    packageManager,
    testRunner: "unknown",
    linter: "unknown",
    entrypoint: "unknown",
    gitBranch,
    recentCommits,
    hiruMDContent: openHiruMDContent,
    importantFiles: []
  };
}
