import fs from "fs-extra";
import path from "path";
import chalk from "chalk";

/**
 * SkillVersionManager
 * Responsibilities:
 * 1. Scan library directory and group files by base skill name
 * 2. Parse version number from filename pattern: {name}_v{version}.{ext}
 * 3. For each skill group, identify the highest version number
 * 4. Return only the latest version file path per skill
 * 5. Provide cleanup method to delete all non-latest versions
 * 6. Cache result for 60 seconds to avoid re-scanning
 */
export class SkillVersionManager {
  private libraryDir: string;
  private cache: { result: Map<string, string>; timestamp: number } | null = null;
  private readonly CACHE_TTL = 60_000;

  constructor(libraryDir: string) {
    this.libraryDir = libraryDir;
  }

  /**
   * Returns a Map where the key is the skill base name and the value is the full path
   * to the latest version file found in the library.
   */
  async getLatestVersions(): Promise<Map<string, string>> {
    const now = Date.now();
    if (this.cache && now - this.cache.timestamp < this.CACHE_TTL) {
      return this.cache.result;
    }

    if (!(await fs.pathExists(this.libraryDir))) {
      return new Map();
    }

    const files = await fs.readdir(this.libraryDir);
    const groups = new Map<string, { version: number; path: string; ext: string }[]>();

    for (const file of files) {
      const parsed = this.parseSkillFilename(file);
      if (!parsed) continue;

      const fullPath = path.join(this.libraryDir, file);
      const existing = groups.get(parsed.base) || [];
      existing.push({ version: parsed.version, path: fullPath, ext: path.extname(file) });
      groups.set(parsed.base, existing);
    }

    const latestResult = new Map<string, string>();
    for (const [base, versions] of groups.entries()) {
      // Sort descending by version, prefer code files over metadata on ties.
      versions.sort((a, b) => {
        if (b.version !== a.version) return b.version - a.version;
        // Priority: .json (0) > others (1). Use a.ext === ".json" ? -1 : 0 to sort .json first.
        const aPriority = a.ext === ".json" ? 0 : 1;
        const bPriority = b.ext === ".json" ? 0 : 1;
        return aPriority - bPriority; // Ascending: 0 comes before 1
      });
      latestResult.set(base, versions[0].path);
    }

    this.cache = { result: latestResult, timestamp: now };
    return latestResult;
  }

  /**
   * Parses "{name}_v{version}.ts/json" -> { base: "{name}", version: {version} }
   */
  private parseSkillFilename(filename: string): { base: string; version: number } | null {
    // Matches patterns like web_search_v56.json or crypto_v1.ts
    const match = filename.match(/^(.+)_v(\d+)\.(ts|js|json)$/);
    if (!match) return null;

    return {
      base: match[1],
      version: parseInt(match[2], 10),
    };
  }

  /**
   * Delete all non-latest versions from disk.
   */
  async pruneOldVersions(dryRun: boolean = true): Promise<{ deleted: string[]; kept: string[] }> {
    const files = await fs.readdir(this.libraryDir);
    const latestVersionByBase = new Map<string, number>();

    for (const file of files) {
      const parsed = this.parseSkillFilename(file);
      if (!parsed) continue;
      const current = latestVersionByBase.get(parsed.base) ?? -1;
      if (parsed.version > current) {
        latestVersionByBase.set(parsed.base, parsed.version);
      }
    }

    const deleted: string[] = [];
    const kept: string[] = [];

    for (const file of files) {
      // Only prune files that follow our versioning pattern
      const parsed = this.parseSkillFilename(file);
      if (!parsed) {
        kept.push(file);
        continue;
      }

      const fullPath = path.join(this.libraryDir, file);
      const latestVersion = latestVersionByBase.get(parsed.base);
      if (latestVersion !== undefined && parsed.version === latestVersion) {
        kept.push(file);
      } else {
        if (!dryRun) {
          await fs.remove(fullPath);
        }
        deleted.push(file);
      }
    }

    // Clear cache after pruning
    this.cache = null;
    return { deleted, kept };
  }

  /**
   * Keep only the newly written version for a specific base skill.
   */
  async replaceVersion(baseName: string, newFilePath: string): Promise<void> {
    const files = await fs.readdir(this.libraryDir);
    const newPath = path.resolve(newFilePath);
    const target = this.parseSkillFilename(path.basename(newPath));

    for (const file of files) {
      const parsed = this.parseSkillFilename(file);
      if (!parsed || parsed.base !== baseName) continue;

      const fullPath = path.join(this.libraryDir, file);
      // Keep the freshly written file and any sibling artifact (.ts/.json) at the same version.
      const sameVersionSibling = target && parsed.version === target.version;
      if (!sameVersionSibling && path.resolve(fullPath) !== newPath) {
        await fs.remove(fullPath);
      }
    }

    this.cache = null;
  }

  /**
   * One-time migration: load all latest skills, delete rest.
   */
  async migrate(): Promise<void> {
    const stats = await this.pruneOldVersions(false);
    console.log(chalk.cyan(`[SkillManager] Migration complete. Pruned ${stats.deleted.length} old versions, kept ${stats.kept.length} latest.`));
  }
}
