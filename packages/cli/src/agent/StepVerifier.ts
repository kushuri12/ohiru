import fs from "fs-extra";
import path from "path";
import { execa } from "execa";
import { ProjectContext } from "shared";

export interface VerificationResult {
  verified: boolean;
  message?: string;
  suggestion?: string;
}

/**
 * StepVerifier ensures that the AI's harmful or structural changes actually happened.
 * This prevents the AI from "hallucinating" that it edited a file when the tool 
 * failed silently or the AI provided invalid search blocks.
 */
export class StepVerifier {
  /**
   * Verifies the result of a tool execution.
   * returns a string message if verification failed, null if okay.
   */
  static async verify(toolName: string, args: any, result: any, ctx: ProjectContext): Promise<VerificationResult> {
    // 1. Check for file edits
    if (toolName === "edit_file" || toolName === "write_file") {
      return await this.verifyFileChange(args.path || args.file, result);
    }

    // 2. Check for shell commands that should produce a file
    if (toolName === "run_shell") {
       // Logic for specific commands like 'git' or 'mkdir' could go here
    }

    return { verified: true };
  }

  private static async verifyFileChange(
    filePath: string,
    result: any
  ): Promise<VerificationResult> {
    if (!filePath) return { verified: true };

    let resultStr = "";
    try {
      resultStr = typeof result === "string"
        ? result
        : JSON.stringify(result ?? "");
    } catch (e) {
      resultStr = String(result || "");
    }

    // Jika tool sudah report error, jangan double-report dari verifier
    // Biarkan agent handle dari tool result saja
    const toolAlreadyFailed =
      resultStr.toLowerCase().includes("error") ||
      resultStr.toLowerCase().includes("failed") ||
      resultStr.toLowerCase().includes("enoent") ||
      resultStr.toLowerCase().includes("no such file");

    if (toolAlreadyFailed) {
      return { verified: true }; // Tool sudah report, verifier tidak perlu ikut campur
    }

    if (
      resultStr.includes("No changes were made") ||
      resultStr.includes("not found")
    ) {
      return {
        verified: false,
        message: "File modification failed: target content not found.",
        suggestion:
          "Use read_file first to see current content before edit_file.",
      };
    }

    try {
      await fs.access(filePath);
      
      // -- INVISIBLE LINTER (Anti-Hallucination Core) --
      const ext = path.extname(filePath).toLowerCase();
      
      if (ext === '.json') {
         try {
            const content = await fs.readFile(filePath, "utf8");
            JSON.parse(content);
         } catch (e: any) {
            return {
               verified: false,
               message: `Syntax Error in JSON file: ${e.message}`,
               suggestion: `Read the JSON file and fix the invalid format.`
            };
         }
      } else if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
         try {
            // Invisible JS syntax check (AST parsing via node)
            await execa("node", ["--check", filePath], { reject: true });
         } catch (e: any) {
            const stderr = e.stderr || e.message;
            // Clean up the stderr for the AI
            const cleanedErr = stderr.split('\n').filter((l: string) => !l.includes('at ')).join('\n');
            return {
               verified: false,
               message: `Syntax Error in JS file after edit:\n${cleanedErr}`,
               suggestion: `Your edit broke the code syntax. Please review the lines around your last edit and fix it.`
            };
         }
      }

    } catch (e) {
      // Cek apakah direktori induk ada
      const parentDir = path.dirname(filePath);
      try {
        await fs.access(parentDir);
        // Parent ada tapi file tidak — genuine write failure
        return {
          verified: false,
          message: `File '${path.basename(filePath)}' does not exist after write attempt.`,
          suggestion: "Check if write_file returned an error and handle it first.",
        };
      } catch {
        // Parent directory tidak ada — ini root cause sebenarnya
        return {
          verified: false,
          message: `Directory '${parentDir}' does not exist.`,
          suggestion: `Run: mkdir -p ${parentDir} — then retry write_file.`,
        };
      }
    }

    return { verified: true };
  }
}
