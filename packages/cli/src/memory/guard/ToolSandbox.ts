import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { execa } from "execa";

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export const TOOL_LIMITS = {
  read_file: {
    maxFileSizeBytes: 5 * 1024 * 1024, // 5MB limit for full read
    maxOutputChars: 50_000,           // Truncate output to 50K chars
    timeoutMs: 5_000,
  },
  run_shell: {
    maxOutputChars: 20_000,
    timeoutMs: 60_000,                // 1 minute timeout
    maxMemoryMB: 512,                 // Child process limit
  },
  default: {
    maxOutputChars: 10_000,
    timeoutMs: 30_000,
  },
} as const;

export class ToolSandbox {
  /**
   * Safely reads a file with size checks, streaming, and line range support.
   */
  async readFile(filePath: string, startLine?: number, endLine?: number): Promise<string> {
    const limits = TOOL_LIMITS.read_file;
    let fileSize: number;

    try {
      const stats = await stat(filePath);
      fileSize = stats.size;
    } catch (e: any) {
      throw new Error(`File not found: ${filePath}`);
    }

    let content: string;
    if (fileSize > limits.maxFileSizeBytes && !startLine) {
        content = await this.readFileLarge(filePath, fileSize, limits.maxOutputChars);
    } else {
        const fs = await import("node:fs/promises");
        content = await fs.readFile(filePath, "utf-8");
    }

    // Apply line-based slicing if requested
    if (startLine !== undefined || endLine !== undefined) {
      const lines = content.split("\n");
      const start = startLine ? Math.max(0, startLine - 1) : 0;
      const end = endLine ? Math.min(lines.length, endLine) : lines.length;
      content = lines.slice(start, end).join("\n");
    }

    return this.truncateString(content, limits.maxOutputChars, fileSize);
  }

  /**
   * Stream large files to avoid loading the whole file into Node.js heap.
   */
  private async readFileLarge(
    filePath: string,
    fileSize: number,
    maxChars: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: string[] = [];
      let totalChars = 0;
      let isTruncated = false;

      const stream = createReadStream(filePath, {
        encoding: "utf-8",
        highWaterMark: 64 * 1024, // 64KB chunks
      });

      stream.on("data", (chunk: string) => {
        if (isTruncated) return;

        if (totalChars + chunk.length > maxChars) {
          chunks.push(chunk.slice(0, maxChars - totalChars));
          isTruncated = true;
          stream.destroy();
        } else {
          chunks.push(chunk);
          totalChars += chunk.length;
        }
      });

      stream.on("close", () => {
        const content = chunks.join("");
        const suffix = isTruncated
          ? `\n\n[File too large: ${fileSize} bytes. Read first ${maxChars} chars only. Use specific search to find more.]`
          : "";
        resolve(content + suffix);
      });

      stream.on("error", (err) => reject(err));
    });
  }

  /**
   * Runs a shell command safely with timeout and output limits.
   */
  async runShell(command: string, cwd: string): Promise<ShellResult> {
    const limits = TOOL_LIMITS.run_shell;

    try {
      const result = await execa(command, {
        shell: true,
        cwd,
        timeout: limits.timeoutMs,
        maxBuffer: limits.maxOutputChars * 2,
        reject: false,
        env: {
          ...process.env,
          NODE_OPTIONS: `--max-old-space-size=${limits.maxMemoryMB}`,
        }
      });

      return {
        stdout: this.truncateString(result.stdout || "", limits.maxOutputChars),
        stderr: this.truncateString(result.stderr || "", 5000),
        exitCode: result.exitCode ?? 0
      };
    } catch (e: any) {
      return {
        stdout: "",
        stderr: `Process Error: ${e.message}`,
        exitCode: 1
      };
    }
  }

  /**
   * Helper to truncate strings with informative messaging.
   */
  truncateString(str: string, maxChars: number, totalSize?: number): string {
    if (str.length <= maxChars) return str;

    const truncated = str.slice(0, maxChars);
    const info = totalSize 
      ? `Total file size: ${totalSize} bytes.` 
      : `Original length: ${str.length} chars.`;

    return `${truncated}\n\n[... Truncated for memory safety. ${info} ...]`;
  }

  /**
   * Standard output truncation for any tool result.
   */
  truncateToolOutput(toolName: string, output: string): string {
    const limits = (TOOL_LIMITS as any)[toolName] || TOOL_LIMITS.default;
    return this.truncateString(output, limits.maxOutputChars || 10000);
  }
}
