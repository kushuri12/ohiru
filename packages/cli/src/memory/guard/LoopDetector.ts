import { createHash } from "node:crypto";

export interface LoopResult {
  isLoop: boolean;
  type?: "repeated_tool" | "identical_call" | "pattern_loop";
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

/**
 * Detects and prevents infinite agent tool call loops.
 * Monitors for repeated tools, identical arguments, and repeating cycles.
 */
export class LoopDetector {
  private history: ToolCallRecord[] = [];
  private readonly WINDOW_SIZE = 40;     // Look back at last 40 calls
  private readonly REPEAT_MAX = 6;       // Max same tool in a row
  private readonly IDENTICAL_MAX = 6;    // Max identical input calls (non-read-only)
  private readonly READ_ONLY_MAX = 10;   // Max identical read-only calls
  private readonly TOTAL_READ_ONLY_MAX = 20; // Max total read-only calls in window
  private readonly TIME_WINDOW_MS = 60_000;

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

    if (this.history.length > this.WINDOW_SIZE * 2) {
      this.history = this.history.slice(-this.WINDOW_SIZE);
    }
  }

  /**
   * Evaluates the current history for known looping patterns.
   */
  detect(): LoopResult {
    const window = this.getRecentWindow();
    if (window.length < 2) return { isLoop: false };

    // 1. Same tool repeatedly in a row
    const repeat = this.checkRepeatedTool(window);
    if (repeat.isLoop) return repeat;

    // 2. Identical arguments repeated anywhere in the window
    const identical = this.checkIdenticalCalls(window);
    if (identical.isLoop) return identical;

    const pattern = this.checkPattern(window);
    if (pattern.isLoop) return pattern;

    // 4. Desktop Miss Loop (screenshot -> examine -> move)
    const desktopLoop = this.checkDesktopMissLoop(window);
    if (desktopLoop.isLoop) return desktopLoop;

    return { isLoop: false };
  }

  private checkRepeatedTool(records: ToolCallRecord[]): LoopResult {
    if (records.length < this.REPEAT_MAX) return { isLoop: false };
    
    const lastN = records.slice(-this.REPEAT_MAX);
    const allSameName = lastN.every(r => r.name === lastN[0].name);
    if (!allSameName) return { isLoop: false };

    // KUNCI: Harus cek apakah INPUT juga sama
    // Kalau nama sama tapi hash beda -> bukan loop (misal nulis 10 file berbeda)
    const allSameInput = lastN.every(r => r.hash === lastN[0].hash);
    if (!allSameInput) return { isLoop: false };

    // If previous calls had errors, this is a retry, not a loop.
    const prevHadError = lastN.slice(0, -1).some(r => r.resultWasError);
    if (prevHadError) return { isLoop: false };

    return {
      isLoop: true,
      type: "identical_call",
      toolName: lastN[0].name,
      message: `Tool "${lastN[0].name}" called ${this.REPEAT_MAX}x with IDENTICAL args and no reported error.`,
      suggestion: `The tool appears to succeed but the agent keeps repeating it with the exact same inputs. Check if the tool's effect is actually happening.`
    };
  }

  private checkIdenticalCalls(records: ToolCallRecord[]): LoopResult {
    const counts = new Map<string, number>();
    const errorMap = new Map<string, boolean>();
    let totalReadOnlyCalls = 0;

    for (const r of records) {
      counts.set(r.hash, (counts.get(r.hash) || 0) + 1);
      if (r.resultWasError) errorMap.set(r.hash, true);

      const isReadOnly = ["list_files", "read_file"].includes(r.name);
      if (isReadOnly) totalReadOnlyCalls++;
    }

    // Check total read-only calls across window (exploration loop)
    // ONLY block if they are highly repetitive (not many unique hashes)
    const readOnlyCalls = records.filter(r => ["list_files", "read_file"].includes(r.name));
    const uniqueReadOnlyHashes = new Set(readOnlyCalls.map(r => r.hash));

    if (totalReadOnlyCalls >= this.TOTAL_READ_ONLY_MAX) {
      if (uniqueReadOnlyHashes.size < totalReadOnlyCalls * 0.5) {
      const readOnlyNames = records
        .filter(r => ["list_files", "read_file"].includes(r.name))
        .map(r => r.name);
      return {
        isLoop: true,
        type: "pattern_loop",
        message: `Agent stuck in exploration loop: ${totalReadOnlyCalls} read-only calls (list_files/read_file) without making any changes.`,
        suggestion: `The agent keeps reading files but never modifies anything. Try a more specific prompt.`
      };
      }
    }

    for (const [hash, count] of counts) {
      const example = records.find(r => r.hash === hash);
      if (!example) continue;
      
      let isReadOnly = ["list_files", "read_file"].includes(example.name);
      
      // Also allow more for investigative shell commands
      if (example.name === "run_shell") {
        const cmd = String(example.input.command || example.input.cmd || "").toLowerCase().trim();
        const safeCmds = ["ls", "dir", "git status", "pwd", "whoami", "node -v", "npm -v", "yarn -v"];
        if (safeCmds.some(s => cmd === s || cmd.startsWith(s + " "))) {
          isReadOnly = true;
        }
      }

      const threshold = isReadOnly ? this.READ_ONLY_MAX : this.IDENTICAL_MAX;

      if (count >= threshold && !errorMap.get(hash)) {
        return {
          isLoop: true,
          type: "identical_call",
          toolName: example.name,
          message: `Identical call to "${example.name}" (with Same Input) detected ${count} times without error.`,
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

    // Pattern: A B A B A B (IDENTICAL Name+Input sequence)
    // Cek dulu apakah nama berulang (a,b,a,b,a,b)
    const names = last6.map(r => r.name);
    const isNamePattern =
      names[0] === names[2] && names[2] === names[4] &&
      names[1] === names[3] && names[3] === names[5];

    if (!isNamePattern) return { isLoop: false };

    // Cek apakah input juga berulang (a1,b1,a1,b1,a1,b1)
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
    // Deteksi: take_screenshot -> examine_image -> move_mouse (berulang 3x)
    const DESKTOP_CYCLE = ["take_screenshot", "examine_image", "move_mouse"];
    const names = records.slice(-9).map(r => r.name);
    
    let cycleCount = 0;
    for (let i = 0; i <= names.length - 3; i += 3) {
      const slice = names.slice(i, i + 3);
      // We check if the cycle matches, allowing for underscore variations
      if (DESKTOP_CYCLE.every((n, j) => slice[j]?.replace("_", "") === n.replace("_", ""))) {
        cycleCount++;
      }
    }

    if (cycleCount >= 3) {
      return {
        isLoop: true,
        type: "pattern_loop",
        message: "Desktop click-miss loop detected (screenshot -> examine -> click repeated 3×).",
        suggestion: "Switch to click_element by name, or use inspect_ui for exact coordinates. Do NOT retry the same click."
      };
    }
    return { isLoop: false };
  }

  private hashCall(name: string, input: Record<string, unknown>): string {
    const safeInput = input || {};
    const str = (name || "unknown") + JSON.stringify(safeInput, Object.keys(safeInput).sort());
    return createHash("sha1").update(str).digest("hex").slice(0, 10);
  }

  private getRecentWindow() {
    return this.history.filter(r => r.timestamp > Date.now() - this.TIME_WINDOW_MS);
  }

  reset() { this.history = []; }
}
