import path from "path";
import os from "os";
import fs from "fs-extra";
import crypto from "crypto";

/**
 * .openhiru directory in user's home for persistent data and storage
 */
export const HIRU_DIR = path.join(os.homedir(), ".openhiru");
const OLD_HIRU_DIR = path.join(os.homedir(), ".hiru");

/**
 * .openhiru/screenshot for screenshots taken by tools
 */
export const HIRU_SCREENSHOTS_DIR = path.join(HIRU_DIR, "screenshot");

/**
 * .openhiru/received for files received from user/sources
 */
export const HIRU_RECEIVED_DIR = path.join(HIRU_DIR, "received");

/**
 * .openhiru/data for internal storage (memory, sessions, etc)
 */
export const HIRU_DATA_DIR = path.join(HIRU_DIR, "data");
export const HIRU_PROJECTS_DATA_DIR = path.join(HIRU_DIR, "projects");

/**
 * .openhiru/exports for files created for the user
 */
export const HIRU_EXPORTS_DIR = path.join(HIRU_DIR, "exports");

/**
 * .openhiru/skills for dynamic skills
 */
export const HIRU_SKILLS_DIR = path.join(HIRU_DIR, "skills");

/**
 * Ensure all standard hiru directories exist and migrate old files if needed.
 */
export async function ensureHiruDirs() {
  // Migration: If .hiru exists but .openhiru doesn't, rename it
  try {
    const oldExists = await fs.access(OLD_HIRU_DIR).then(() => true).catch(() => false);
    const newExists = await fs.access(HIRU_DIR).then(() => true).catch(() => false);
    if (oldExists && !newExists) {
      await fs.rename(OLD_HIRU_DIR, HIRU_DIR);
    }
  } catch (e) { /* ignore */ }

  await fs.mkdir(HIRU_SCREENSHOTS_DIR, { recursive: true });
  await fs.mkdir(HIRU_RECEIVED_DIR, { recursive: true });
  await fs.mkdir(HIRU_DATA_DIR, { recursive: true });
  await fs.mkdir(HIRU_PROJECTS_DATA_DIR, { recursive: true });
  await fs.mkdir(HIRU_EXPORTS_DIR, { recursive: true });
  await fs.mkdir(HIRU_SKILLS_DIR, { recursive: true });

  // Migration for cleaner root: Move DBs and memory files from .hiru to .hiru/data
  const migrateFiles = [
    "sessions.db", "sessions.db-wal", "sessions.db-shm",
    "checkpoints.db", "checkpoints.db-wal", "checkpoints.db-shm",
    "memory.json"
  ];

  for (const file of migrateFiles) {
    const oldPath = path.join(HIRU_DIR, file);
    const newPath = path.join(HIRU_DATA_DIR, file);
    try {
      // Only move if old exists and new doesn't
      const exists = await fs.access(oldPath).then(() => true).catch(() => false);
      const newExists = await fs.access(newPath).then(() => true).catch(() => false);
      
      if (exists && !newExists) {
        await fs.rename(oldPath, newPath);
      }
    } catch (e) {
      // Ignore migration errors
    }
  }

  // Migration for config files
  const configs = [
    { old: ".hirurc", new: ".openhirurc" },
    { old: ".hiru.env", new: ".openhiru.env" }
  ];

  for (const cfg of configs) {
    const oldP = path.join(os.homedir(), cfg.old);
    const newP = path.join(os.homedir(), cfg.new);
    try {
      const exists = await fs.access(oldP).then(() => true).catch(() => false);
      const newExists = await fs.access(newP).then(() => true).catch(() => false);
      if (exists && !newExists) {
        await fs.rename(oldP, newP);
      }
    } catch (e) {}
  }
}

/**
 * Get a path for a new screenshot.
 */
export function getScreenshotPath(filename?: string) {
  return path.join(HIRU_SCREENSHOTS_DIR, filename || `screenshot-${Date.now()}.png`);
}

/**
 * Get a path for a file received from user.
 */
export function getReceivedPath(filename: string) {
  return path.join(HIRU_RECEIVED_DIR, filename);
}

/**
 * Get a path for a file exported by hiru.
 */
export function getExportPath(filename: string) {
  return path.join(HIRU_EXPORTS_DIR, filename);
}

/**
 * Resolves a path, expanding ~ to home directory.
 */
export function resolveSafePath(p: string) {
  const trimmed = p.trim();
  if (trimmed.startsWith("~")) {
    return path.join(os.homedir(), trimmed.slice(1));
  }
  return path.resolve(process.cwd(), trimmed);
}

/**
 * Checks if a path is within allowed directories (CWD or .hiru)
 */
export function isSafePath(resolvedPath: string) {
  const cwd = process.cwd();
  return resolvedPath.startsWith(cwd) || resolvedPath.startsWith(HIRU_DIR);
}

/**
 * Get the global persistent path for project-specific memory (OPENHIRU.md replacement)
 */
export function getProjectMemoryPath(projectRoot: string): string {
    const hash = crypto.createHash('md5').update(projectRoot).digest('hex').slice(0, 8);
    const name = path.basename(projectRoot) || "root";
    return path.join(HIRU_PROJECTS_DATA_DIR, `${name}-${hash}.md`);
}
