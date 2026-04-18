import fs from "fs-extra";
import path from "path";
import { ProjectContext } from "shared";
import { execa } from "execa";

export async function detectProjectContext(root: string): Promise<ProjectContext> {
  let hiruMDContent = "";
  try {
    hiruMDContent = await fs.readFile(path.join(root, "HIRU.md"), "utf-8");
  } catch (e) {
    // HIRU.md does not exist yet
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
    const branchRes = await execa({ shell: true, cwd: root })`git branch --show-current`;
    gitBranch = branchRes.stdout.trim();

    const commitsRes = await execa({ shell: true, cwd: root })`git log -n 3 --oneline`;
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
    hiruMDContent,
    importantFiles: []
  };
}
