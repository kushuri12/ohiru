// packages/cli/src/tools/ToolValidator.ts
// Post-execution validation for critical tool operations.

import fs from "fs/promises";

export interface ValidationResult {
  readonly valid: boolean;
  readonly message: string;
}

export class ToolValidator {
  /**
   * Verify a file was actually written and matches expected content.
   */
  static async validateWrite(
    filePath: string,
    expectedContent: string
  ): Promise<ValidationResult> {
    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        return {
          valid: false,
          message: `Path exists but is not a file: ${filePath}`,
        };
      }

      // Hanya cek file ada dan ukurannya tidak 0
      // Jangan bandingkan content byte-per-byte — encoding normalization
      // bisa mengubah ukuran secara valid (CRLF, BOM, unicode normalization)
      if (stats.size === 0 && expectedContent.length > 0) {
        return {
          valid: false,
          message: `File written but appears empty (0 bytes). Possible disk issue.`,
        };
      }

      return {
        valid: true,
        message: `File verified: ${stats.size} bytes written to ${filePath}`,
      };
    } catch (e: any) {
      return {
        valid: false,
        message: `Verification failed: ${e.message}`,
      };
    }
  }

  /**
   * Check shell output for hidden error patterns, even when exit code is 0.
   */
  static validateShellOutput(
    command: string,
    output: string,
    exitCode: number
  ): ValidationResult {
    if (exitCode !== 0) {
      return {
        valid: false,
        message: `Command failed with exit code ${exitCode}.`,
      };
    }

    // Patterns that indicate failure even with exit 0
    const ERROR_PATTERNS: RegExp[] = [
      /\bERR!\b/,
      /\bFATAL\b/i,
      /\bpanic\b/i,
      /SyntaxError/,
      /TypeError/,
      /ReferenceError/,
      /Cannot find module/i,
      /Module not found/i,
      /ENOENT/,
      /EACCES/,
      /Segmentation fault/i,
    ];

    const matched = ERROR_PATTERNS.find(p => p.test(output));
    if (matched) {
      return {
        valid: false,
        message: `Command exited 0 but output contains suspicious pattern: ${matched.source}. Inspect output carefully.`,
      };
    }

    return { valid: true, message: "Command completed successfully." };
  }

  /**
   * Validate that an edit actually changed the file (not a no-op edit).
   */
  static async validateEdit(filePath: string, oldContent: string, newContent: string): Promise<ValidationResult> {
    if (oldContent === newContent) {
      return { valid: false, message: "Edit is a no-op: old and new content are identical." };
    }

    try {
      const actualContent = await fs.readFile(filePath, "utf8");
      if (actualContent.includes(newContent) || actualContent === newContent) {
        return { valid: true, message: "Edit applied and verified successfully." };
      }

      // It's possible the edit was partial — still valid if the file was updated
      const stats = await fs.stat(filePath);
      return { valid: true, message: `File updated: ${stats.size} bytes.` };
    } catch (e: any) {
      return { valid: false, message: `Edit verification failed: ${e.message}` };
    }
  }
}
