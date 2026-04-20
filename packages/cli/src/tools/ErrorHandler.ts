// Structured error handling with categorization and recovery suggestions.
import fs from "fs-extra";
import path from "path";
import os from "os";

export interface ErrorPattern {
  id: string;
  toolName: string;
  errorSignature: string;   // regex pattern to match error text
  fixHint: string;          // injected into agent context on match
  autoFix?: string;         // if set, auto-execute this command before retry
  seenCount: number;
  lastSeen: string;         // ISO date
}

export class ErrorPatternLibrary {
  private patterns: ErrorPattern[] = [];
  private readonly persistPath: string; // ~/.openhiru/error-patterns.json
  
  constructor() {
    this.persistPath = path.join(os.homedir(), ".openhiru", "error-patterns.json");

    // Seed with built-in patterns
    this.patterns = [
      {
        id: "enoent-npm",
        toolName: "execute_command",
        errorSignature: "ENOENT.*npm|npm.*not found",
        fixHint: "npm is not installed. Use: curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs",
        autoFix: "which node || curl -fsSL https://fnm.vercel.app/install | bash",
        seenCount: 0,
        lastSeen: "",
      },
      {
        id: "ts-error-strict",
        toolName: "execute_command",
        errorSignature: "TS2345|TS2322|TS2339|TS2304",
        fixHint: "TypeScript strict mode error. Read the exact error line, check the type definitions, add explicit type annotation.",
        seenCount: 0,
        lastSeen: "",
      },
      {
        id: "eacces-permission",
        toolName: "execute_command",
        errorSignature: "EACCES|permission denied",
        fixHint: "Permission denied. Try: sudo chmod +x <file>, or run with sudo if safe.",
        seenCount: 0,
        lastSeen: "",
      },
      {
        id: "port-in-use",
        toolName: "execute_command",
        errorSignature: "EADDRINUSE|address already in use|port.*in use",
        fixHint: "Port already in use. Find the process: lsof -i :<port> | grep LISTEN. Kill it: kill -9 <PID>.",
        seenCount: 0,
        lastSeen: "",
      },
      {
        id: "module-not-found",
        toolName: "execute_command",
        errorSignature: "Cannot find module|MODULE_NOT_FOUND",
        fixHint: "Missing npm package. Run: npm install <package-name>. If ESM/CJS issue, check package.json type field.",
        seenCount: 0,
        lastSeen: "",
      },
      {
        id: "git-untracked",
        toolName: "execute_command",
        errorSignature: "nothing to commit|working tree clean",
        fixHint: "No changes to commit. Use git status to check staged files. Maybe files need git add first.",
        seenCount: 0,
        lastSeen: "",
      },
    ];
  }

  /**
   * Load persisted user-observed patterns from disk.
   */
  async init(): Promise<void> {
    if (await fs.pathExists(this.persistPath)) {
      try {
        const raw = await fs.readFile(this.persistPath, "utf8");
        const saved = JSON.parse(raw);
        if (Array.isArray(saved)) {
          // Merge saved into built-in, prefer saved versions
          for (const s of saved) {
            const idx = this.patterns.findIndex(p => p.id === s.id);
            if (idx !== -1) {
              this.patterns[idx] = s;
            } else {
              this.patterns.push(s);
            }
          }
        }
      } catch (e) {
        console.error("Failed to load error patterns:", e);
      }
    }
  }

  /**
   * Check if an error matches a known pattern. Returns pattern if match found.
   */
  match(toolName: string, errorText: string): ErrorPattern | null {
    for (const pattern of this.patterns) {
      if (pattern.toolName !== "any" && pattern.toolName !== toolName) continue;
      
      const regex = new RegExp(pattern.errorSignature, "i");
      if (regex.test(errorText)) {
        return pattern;
      }
    }
    return null;
  }

  /**
   * Record a new error occurrence (persists to disk).
   */
  async recordError(
    toolName: string,
    args: Record<string, any>,
    errorText: string,
    wasFixed: boolean,
    fixApplied?: string
  ): Promise<void> {
    const matched = this.match(toolName, errorText);
    if (matched) {
      matched.seenCount++;
      matched.lastSeen = new Date().toISOString();
      await this.save();
    }
  }

  /**
   * Learn a new pattern from a successful recovery.
   */
  async learnPattern(
    toolName: string,
    errorText: string,
    fixThatWorked: string
  ): Promise<void> {
    const id = `learned-${Date.now()}`;
    const signature = errorText.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex
    
    this.patterns.push({
      id,
      toolName,
      errorSignature: signature,
      fixHint: `Learned fix from previous session: ${fixThatWorked}`,
      seenCount: 1,
      lastSeen: new Date().toISOString(),
    });
    
    await this.save();
  }

  /**
   * Format matched pattern as a hint for injection into agent context.
   */
  formatHint(pattern: ErrorPattern): string {
    return `💡 **PRO TIP:** ${pattern.fixHint}`;
  }

  /**
   * Get stats for debugging.
   */
  getStats(): { topErrors: ErrorPattern[]; totalSeen: number } {
    const sorted = [...this.patterns].sort((a, b) => b.seenCount - a.seenCount);
    const total = this.patterns.reduce((sum, p) => sum + p.seenCount, 0);
    return {
      topErrors: sorted.slice(0, 5),
      totalSeen: total
    };
  }

  private async save(): Promise<void> {
    await fs.ensureDir(path.dirname(this.persistPath));
    await fs.writeFile(this.persistPath, JSON.stringify(this.patterns, null, 2), "utf8");
  }
}

export enum ErrorCategory {
  RECOVERABLE = "recoverable",
  FATAL = "fatal",
  USER_ERROR = "user_error",
  SYSTEM_ERROR = "system_error",
}

export interface StructuredError {
  readonly category: ErrorCategory;
  readonly toolName: string;
  readonly message: string;
  readonly suggestion: string;
  readonly originalError?: Error;
}

const CATEGORY_EMOJI: Record<ErrorCategory, string> = {
  [ErrorCategory.RECOVERABLE]: "⚠️",
  [ErrorCategory.FATAL]: "🔴",
  [ErrorCategory.USER_ERROR]: "❌",
  [ErrorCategory.SYSTEM_ERROR]: "⚙️",
};

export class ErrorHandler {
  /**
   * Classify and wrap a raw error into a StructuredError.
   */
  static handle(toolName: string, error: any): StructuredError {
    const code: string | undefined = error?.code;
    const msg: string = error?.message ?? String(error);

    let category: ErrorCategory;
    let suggestion: string;

    if (code === "ENOENT") {
      category = ErrorCategory.USER_ERROR;
      suggestion = "Check that the file/directory path is correct and exists. Use list_files to verify.";
    } else if (code === "EACCES" || code === "EPERM") {
      category = ErrorCategory.SYSTEM_ERROR;
      suggestion = "Permission denied. Check file permissions or run with appropriate privileges.";
    } else if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("ETIMEDOUT")) {
      category = ErrorCategory.RECOVERABLE;
      suggestion = "Command timed out. Try increasing timeout or simplifying the operation.";
    } else if (msg.includes("SIGTERM") || msg.includes("SIGKILL") || msg.includes("abort")) {
      category = ErrorCategory.FATAL;
      suggestion = "Execution was forcefully terminated. This usually means a critical error or resource exhaustion.";
    } else if (code === "ENOSPC") {
      category = ErrorCategory.SYSTEM_ERROR;
      suggestion = "Disk is full. Free up space before retrying.";
    } else if (msg.includes("Cannot find module") || msg.includes("Module not found")) {
      category = ErrorCategory.USER_ERROR;
      suggestion = "A required dependency is missing. Run 'npm install' or check the import path.";
    } else if (msg.includes("SyntaxError") || msg.includes("TypeError") || msg.includes("ReferenceError")) {
      category = ErrorCategory.USER_ERROR;
      suggestion = "There is a code error. Review the file content and fix the syntax/type issue.";
    } else {
      category = ErrorCategory.RECOVERABLE;
      suggestion = "Unexpected error. Review the error message, adjust your approach, and retry.";
    }

    return {
      category,
      toolName,
      message: this.sanitizeErrorMessage(msg),
      suggestion,
      originalError: error instanceof Error ? error : undefined,
    };
  }

  /**
   * Format a structured error into a human-readable string for the LLM.
   */
  static format(err: StructuredError): string {
    const emoji = CATEGORY_EMOJI[err.category];
    const lines = [
      `${emoji} ${err.category.toUpperCase()} ERROR in ${err.toolName}`,
      ``,
      `Message: ${err.message}`,
      ``,
      `Suggestion: ${err.suggestion}`,
    ];

    if (err.category === ErrorCategory.FATAL) {
      lines.push(``, `⛔ EXECUTION HALTED. This error cannot be recovered automatically.`);
    } else {
      lines.push(``, `💡 You may retry or adjust your approach.`);
    }

    return lines.join("\n");
  }

  /**
   * Remove stack traces from error messages — keep only the meaningful first lines.
   */
  private static sanitizeErrorMessage(msg: string): string {
    const lines = msg.split("\n");
    const meaningful = lines.filter(l => !l.trim().startsWith("at "));
    return meaningful.join("\n").trim().slice(0, 500);
  }

  static shouldRetry(err: StructuredError): boolean {
    return err.category === ErrorCategory.RECOVERABLE;
  }

  static shouldAbort(err: StructuredError): boolean {
    return err.category === ErrorCategory.FATAL;
  }
}
