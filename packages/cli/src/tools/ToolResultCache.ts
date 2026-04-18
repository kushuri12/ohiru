/**
 * ToolResultCache
 * In-memory cache for tool results with TTL. Resets on write operations.
 * Prevents redundant token consumption by avoiding multiple reads of the same file.
 */

export interface CacheEntry {
  result: string;
  timestamp: number;
  hitCount: number;
}

// Tools that MUST NOT be cached (have side effects or are time-sensitive)
const UNCACHEABLE_TOOLS = new Set([
  "execute_command", "run_shell", "run_command",
  "write_file", "edit_file", "create_file", "delete_file",
  "copy_file", "move_file", "create_directory",
  "take_screenshot",  // screen changes
  "search_web",       // results change over time
  "manage_memory",    // mutates state
]);

// Tools that should invalidate cached results on call
const WRITE_TOOLS = new Set([
  "write_file", "edit_file", "create_file", "delete_file",
  "copy_file", "move_file",
]);

export class ToolResultCache {
  private cache = new Map<string, CacheEntry>();
  private readonly TTL_MS: number;
  private totalHits: number = 0;
  private totalMisses: number = 0;

  constructor(ttlMs: number = 30_000) { // 30s default
    this.TTL_MS = ttlMs;
  }

  /**
   * Generate cache key from tool name + args.
   */
  private makeKey(toolName: string, args: Record<string, any>): string {
    return `${toolName}:${JSON.stringify(args)}`;
  }

  /**
   * Get cached result. Returns null if miss, expired, or uncacheable.
   */
  get(toolName: string, args: Record<string, any>): string | null {
    if (UNCACHEABLE_TOOLS.has(toolName)) return null;

    const key = this.makeKey(toolName, args);
    const entry = this.cache.get(key);

    if (!entry) {
      this.totalMisses++;
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > this.TTL_MS) {
      this.cache.delete(key);
      this.totalMisses++;
      return null;
    }

    entry.hitCount++;
    this.totalHits++;
    return entry.result;
  }

  /**
   * Store result. Skips uncacheable tools.
   */
  set(toolName: string, args: Record<string, any>, result: string): void {
    if (UNCACHEABLE_TOOLS.has(toolName)) {
      // If this is a write tool, invalidate related caches
      if (WRITE_TOOLS.has(toolName)) {
        const pathArg = args.path || args.filePath || args.targetPath || args.TargetFile;
        if (pathArg) this.invalidatePath(pathArg);
      }
      return;
    }

    const key = this.makeKey(toolName, args);
    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      hitCount: 0,
    });
  }

  /**
   * When a write happens to a path, invalidate all reads of that path.
   */
  invalidatePath(filePath: string): void {
    const keysToExclude: string[] = [];
    for (const [key, _] of this.cache.entries()) {
      if (key.includes(filePath)) {
        keysToExclude.push(key);
      }
    }
    for (const key of keysToExclude) {
      this.cache.delete(key);
    }
  }

  /**
   * Stats for debugging and session summary.
   */
  getStats(): { size: number; totalHits: number; hitRate: string } {
    const total = this.totalHits + this.totalMisses;
    const rate = total === 0 ? "0%" : `${Math.round((this.totalHits / total) * 100)}%`;
    return {
      size: this.cache.size,
      totalHits: this.totalHits,
      hitRate: rate,
    };
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.cache.clear();
    this.totalHits = 0;
    this.totalMisses = 0;
  }
}
