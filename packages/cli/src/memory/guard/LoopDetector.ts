import { createHash } from "node:crypto";

export interface LoopResult {
  isLoop: boolean;
  type?: "repeated_tool" | "identical_call" | "pattern_loop" | "exploration_hell" | "state_oscillation";
  toolName?: string;
  count?: number;
  message?: string;
  suggestion?: string;
}

interface ToolCallRecord {
  hash: string;
  name: string;
  input: Record<string, unknown>;
  timestamp: number;
  resultWasError: boolean;
}

export interface LoopConfig {
  readonly maxRepeated: number;
  readonly maxIdentical: number;
  readonly maxReadOnly: number;
  readonly maxTotalReadOnly: number;
  readonly windowSize: number;
  readonly timeWindowMs: number;
}

const DEFAULT_CONFIG: LoopConfig = {
  maxRepeated: 12,       // Nulis banyak file = normal untuk project creation
  maxIdentical: 4,       // Ini tetap rendah — identical args itu memang loop
  maxReadOnly: 8,
  maxTotalReadOnly: 15,
  windowSize: 30,
  timeWindowMs: 45_000,
};

/**
 * Detects and prevents infinite agent tool call loops.
 * Enhanced with: semantic similarity, exploration hell, state oscillation.
 */
export class LoopDetector {
  private history: ToolCallRecord[] = [];
  private config: LoopConfig;
  private fileStateHistory: Map<string, string[]> = new Map();

  constructor(config?: Partial<LoopConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Records a tool call hash for future loop comparison.
   */
  record(name: string, input: Record<string, unknown>, resultWasError = false): void {
    const hash = this.hashCall(name, input);
    this.history.push({
      hash,
      name,
      input,
      timestamp: Date.now(),
      resultWasError
    });

    if (this.history.length > this.config.windowSize * 2) {
      this.history = this.history.slice(-this.config.windowSize);
    }

    // Track file state for oscillation detection
    if (name === "write_file" || name === "edit_file" || name === "create_file") {
      const file = String(input.path || input.file_path || input.filename || "");
      if (file) {
        const contentHash = this.hashContent(input.content || input.new_content || "");
        if (!this.fileStateHistory.has(file)) {
          this.fileStateHistory.set(file, []);
        }
        this.fileStateHistory.get(file)!.push(contentHash);
      }
    }
  }

  /**
   * Evaluates the current history for known looping patterns.
   */
  detect(): LoopResult {
    const window = this.getRecentWindow();
    if (window.length < 2) return { isLoop: false };

    // 1. Same tool repeatedly in a row with same input
    const repeat = this.checkRepeatedTool(window);
    if (repeat.isLoop) return repeat;

    // 2. Identical arguments repeated anywhere in the window
    const identical = this.checkIdenticalCalls(window);
    if (identical.isLoop) return identical;

    // 3. A↔B cyclic pattern
    const pattern = this.checkPattern(window);
    if (pattern.isLoop) return pattern;

    // 4. Desktop miss loop (screenshot → examine → click repeated)
    const desktopLoop = this.checkDesktopMissLoop(window);
    if (desktopLoop.isLoop) return desktopLoop;

    // 5. ✨ NEW: Exploration hell — too many reads, no writes
    const exploration = this.checkExplorationHell(window);
    if (exploration.isLoop) return exploration;

    // 6. ✨ NEW: State oscillation — A→B→A on same file
    const oscillation = this.checkStateOscillation();
    if (oscillation.isLoop) return oscillation;

    // 7. ✨ NEW: Semantic duplicates (read_file ≈ cat, list_files ≈ ls)
    const semantic = this.checkSemanticDuplicates(window);
    if (semantic.isLoop) return semantic;

    return { isLoop: false };
  }

  // ═══════════════════════════════════════════════════════
  // EXISTING CHECKS (with configurable thresholds)
  // ═══════════════════════════════════════════════════════

  private checkRepeatedTool(records: ToolCallRecord[]): LoopResult {
    // Write operations are legitimately repeated during project creation
    const WRITE_TOOLS = ["write_file", "create_file", "edit_file"];
    
    if (records.length < 2) return { isLoop: false };

    const last = records[records.length - 1];
    const name = last.name;
    const hash = last.hash;

    // Count how many times the exact same call has been made consecutively
    let count = 0;
    for (let i = records.length - 1; i >= 0; i--) {
      if (records[i].name === name && records[i].hash === hash) {
        count++;
      } else {
        break;
      }
    }

    // Jika tool adalah write tool, gunakan threshold lebih tinggi
    const threshold = WRITE_TOOLS.includes(name)
      ? this.config.maxRepeated * 2
      : this.config.maxRepeated;

    if (count >= threshold) {
      // If previous calls had errors, this is a retry, not a loop.
      const prevHadError = records.slice(-count, -1).some(r => r.resultWasError);
      if (prevHadError) return { isLoop: false };

      return {
        isLoop: true,
        type: "identical_call",
        toolName: name,
        count,
        message: `Tool "${name}" called ${count}x with IDENTICAL args and no reported error.`,
        suggestion: `The tool appears to succeed but the agent keeps repeating it. Check if the tool's effect is actually happening.`
      };
    }
    return { isLoop: false };
  }

  private checkIdenticalCalls(records: ToolCallRecord[]): LoopResult {
    const counts = new Map<string, number>();
    const errorMap = new Map<string, boolean>();
    let totalReadOnlyCalls = 0;

    for (const r of records) {
      counts.set(r.hash, (counts.get(r.hash) || 0) + 1);
      if (r.resultWasError) errorMap.set(r.hash, true);

      if (this.isReadOnlyTool(r.name, r.input)) totalReadOnlyCalls++;
    }

    // Check total read-only calls (only if highly repetitive)
    const readOnlyCalls = records.filter(r => this.isReadOnlyTool(r.name, r.input));
    const uniqueHashes = new Set(readOnlyCalls.map(r => r.hash));

    if (totalReadOnlyCalls >= this.config.maxTotalReadOnly) {
      if (uniqueHashes.size < totalReadOnlyCalls * 0.5) {
        return {
          isLoop: true,
          type: "pattern_loop",
          count: totalReadOnlyCalls,
          message: `Agent stuck in exploration loop: ${totalReadOnlyCalls} read-only calls without making any changes.`,
          suggestion: `The agent keeps reading files but never modifies anything. Try a more specific prompt.`
        };
      }
    }

    for (const [hash, count] of counts) {
      const example = records.find(r => r.hash === hash);
      if (!example) continue;

      const isReadOnly = this.isReadOnlyTool(example.name, example.input);
      const threshold = isReadOnly ? this.config.maxReadOnly : this.config.maxIdentical;

      if (count >= threshold && !errorMap.get(hash)) {
        return {
          isLoop: true,
          type: "identical_call",
          toolName: example.name,
          count,
          message: `Identical call to "${example.name}" detected ${count} times without error.`,
          suggestion: `The agent is stuck repeating the same action. Try re-directing the task.`
        };
      }
    }
    return { isLoop: false };
  }

  private checkPattern(records: ToolCallRecord[]): LoopResult {
    if (records.length < 6) return { isLoop: false };

    const last6 = records.slice(-6);
    const hashes = last6.map(r => r.hash);
    const names = last6.map(r => r.name);

    // Pattern: A B A B A B
    const isNamePattern =
      names[0] === names[2] && names[2] === names[4] &&
      names[1] === names[3] && names[3] === names[5];
    if (!isNamePattern) return { isLoop: false };

    const isInputPattern =
      hashes[0] === hashes[2] && hashes[2] === hashes[4] &&
      hashes[1] === hashes[3] && hashes[3] === hashes[5];
    if (!isInputPattern) return { isLoop: false };

    return {
      isLoop: true,
      type: "pattern_loop",
      message: `Cyclic pattern with IDENTICAL inputs: ${names[0]} ↔ ${names[1]}.`,
      suggestion: `The agent is oscillating between the exact same operations. Try a different approach.`
    };
  }

  private checkDesktopMissLoop(records: ToolCallRecord[]): LoopResult {
    const DESKTOP_CYCLE = ["take_screenshot", "examine_image", "move_mouse"];
    const names = records.slice(-9).map(r => r.name);

    let cycleCount = 0;
    for (let i = 0; i <= names.length - 3; i += 3) {
      const slice = names.slice(i, i + 3);
      if (DESKTOP_CYCLE.every((n, j) => slice[j]?.replace("_", "") === n.replace("_", ""))) {
        cycleCount++;
      }
    }

    if (cycleCount >= 3) {
      return {
        isLoop: true,
        type: "pattern_loop",
        message: "Desktop click-miss loop detected (screenshot → examine → click repeated 3×).",
        suggestion: "Switch to click_element by name, or use inspect_ui for exact coordinates. Do NOT retry the same click."
      };
    }
    return { isLoop: false };
  }

  // ═══════════════════════════════════════════════════════
  // ✨ NEW CHECKS
  // ═══════════════════════════════════════════════════════

  /**
   * Detect exploration hell: many reads with zero writes.
   */
  private checkExplorationHell(records: ToolCallRecord[]): LoopResult {
    const readOps = records.filter(r => this.isReadOnlyTool(r.name, r.input));
    if (readOps.length < 12) return { isLoop: false };

    const writeOps = records.filter(r => this.isWriteTool(r.name));
    const readRatio = readOps.length / records.length;

    if (readRatio > 0.85 && writeOps.length === 0) {
      return {
        isLoop: true,
        type: "exploration_hell",
        count: readOps.length,
        message: `Exploration hell: ${readOps.length} read operations with 0 writes in the last ${records.length} calls.`,
        suggestion: `The agent is reading files endlessly without acting. Provide more specific instructions about what to change.`
      };
    }

    return { isLoop: false };
  }

  /**
   * Detect state oscillation: writing A→B→A to the same file.
   */
  private checkStateOscillation(): LoopResult {
    for (const [file, hashes] of this.fileStateHistory) {
      if (hashes.length < 3) continue;

      const last3 = hashes.slice(-3);
      // A → B → A pattern
      if (last3[0] === last3[2] && last3[0] !== last3[1]) {
        return {
          isLoop: true,
          type: "state_oscillation",
          message: `State oscillation: File "${file}" is being reverted back and forth between two states.`,
          suggestion: `The agent is undoing and redoing the same edit. Stop, review the requirements, and commit to one approach.`
        };
      }
    }
    return { isLoop: false };
  }

  /**
   * Detect semantically equivalent tool calls.
   * E.g., read_file("x.txt") ≈ run_shell("cat x.txt")
   */
  private checkSemanticDuplicates(records: ToolCallRecord[]): LoopResult {
    const semanticGroups = new Map<string, number>();

    for (const r of records) {
      const key = this.getSemanticKey(r);
      if (key) {
        semanticGroups.set(key, (semanticGroups.get(key) || 0) + 1);
      }
    }

    for (const [key, count] of semanticGroups) {
      if (count >= this.config.maxReadOnly) {
        return {
          isLoop: true,
          type: "identical_call",
          count,
          message: `Semantically identical operation detected ${count} times: ${key}`,
          suggestion: `The agent is performing the same operation using different tools (e.g., read_file ≈ cat). Use the result from the first call.`
        };
      }
    }

    return { isLoop: false };
  }

  // ═══════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════

  /**
   * Generate a semantic key that normalizes equivalent operations.
   * read_file("x.txt") and run_shell("cat x.txt") → "READ:x.txt"
   */
  private getSemanticKey(r: ToolCallRecord): string | null {
    if (r.name === "read_file") {
      const p = String(r.input.path || r.input.file_path || "");
      return p ? `READ:${p}` : null;
    }

    if (r.name === "run_shell") {
      const cmd = String(r.input.command || r.input.cmd || "").trim();
      const catMatch = cmd.match(/^cat\s+(.+)$/);
      if (catMatch) return `READ:${catMatch[1].trim()}`;

      const lsMatch = cmd.match(/^(ls|dir)\s+(.+)$/);
      if (lsMatch) return `LIST:${lsMatch[2].trim()}`;
    }

    if (r.name === "list_files") {
      const p = String(r.input.path || r.input.directory || r.input.dir || ".");
      return `LIST:${p}`;
    }

    return null;
  }

  private isReadOnlyTool(name: string, input?: Record<string, unknown>): boolean {
    if (["list_files", "read_file", "search_files", "take_screenshot", "examine_image", "inspect_ui"].includes(name)) {
      return true;
    }
    if (name === "run_shell" && input) {
      const cmd = String(input.command || input.cmd || "").toLowerCase().trim();
      const readCmds = ["ls", "dir", "cat", "git status", "git log", "git diff", "pwd", "whoami", "node -v", "npm -v", "yarn -v", "find", "grep", "rg", "head", "tail", "wc"];
      return readCmds.some(c => cmd === c || cmd.startsWith(c + " "));
    }
    return false;
  }

  private isWriteTool(name: string): boolean {
    return ["write_file", "create_file", "edit_file"].includes(name);
  }

  private hashCall(name: string, input: Record<string, unknown>): string {
    const safeInput = input || {};
    const str = (name || "unknown") + JSON.stringify(safeInput, Object.keys(safeInput).sort());
    return createHash("sha1").update(str).digest("hex").slice(0, 10);
  }

  private hashContent(content: unknown): string {
    return createHash("sha1").update(String(content)).digest("hex").slice(0, 10);
  }

  private getRecentWindow(): ToolCallRecord[] {
    return this.history.filter(r => r.timestamp > Date.now() - this.config.timeWindowMs);
  }

  reset(): void {
    this.history = [];
    this.fileStateHistory.clear();
  }
}
