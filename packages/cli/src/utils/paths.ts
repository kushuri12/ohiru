import path from "path";
import os from "os";
import fs from "fs/promises";

/**
 * .hiru directory in user's home for persistent data and storage
 */
export const HIRU_DIR = path.join(os.homedir(), ".hiru");

/**
 * .hiru/screenshot for screenshots taken by tools
 */
export const HIRU_SCREENSHOTS_DIR = path.join(HIRU_DIR, "screenshot");

/**
 * .hiru/file for files received from Telegram or other sources
 */
export const HIRU_FILES_DIR = path.join(HIRU_DIR, "file");

/**
 * .hiru/data for internal hiru storage (memory, sessions, etc)
 */
export const HIRU_DATA_DIR = path.join(HIRU_DIR, "data");

/**
 * Ensure all standard hiru directories exist and migrate old files if needed.
 */
export async function ensureHiruDirs() {
  await fs.mkdir(HIRU_SCREENSHOTS_DIR, { recursive: true });
  await fs.mkdir(HIRU_FILES_DIR, { recursive: true });
  await fs.mkdir(HIRU_DATA_DIR, { recursive: true });

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
      const { access, rename } = await import("fs/promises");
      const exists = await access(oldPath).then(() => true).catch(() => false);
      const newExists = await access(newPath).then(() => true).catch(() => false);
      
      if (exists && !newExists) {
        await rename(oldPath, newPath);
      }
    } catch (e) {
      // Ignore migration errors
    }
  }
}

/**
 * Get a path for a new screenshot.
 */
export function getScreenshotPath(filename?: string) {
  return path.join(HIRU_SCREENSHOTS_DIR, filename || `screenshot-${Date.now()}.png`);
}

/**
 * Get a path for a saved file.
 */
export function getFilePath(filename: string) {
  return path.join(HIRU_FILES_DIR, filename);
}
