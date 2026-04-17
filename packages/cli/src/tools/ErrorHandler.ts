// packages/cli/src/tools/ErrorHandler.ts
// Structured error handling with categorization and recovery suggestions.

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
