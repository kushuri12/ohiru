import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { execa } from "execa";
import { EventEmitter } from "events";
import { writeFileWithProgress, globalFileProgress, FileProgressEvent } from "./FileProgress.js";
import { ToolValidator } from "./ToolValidator.js";
import { ErrorHandler } from "./ErrorHandler.js";
import { resolveSafePath, isSafePath } from "../utils/paths.js";
import { UpdatePlanTool } from "./UpdatePlanTool.js";

export const toolEvents = new EventEmitter();

let currentProgressCallback: ((event: FileProgressEvent) => void) | null = null;

export function setFileProgressCallback(callback: ((event: FileProgressEvent) => void) | null) {
  currentProgressCallback = callback;
}

/**
 * Picks specific fields from an object or an array of objects.
 * Useful for reducing token usage in API responses.
 */
function pickFields(obj: any, fields: string[]): any {
  if (Array.isArray(obj)) {
    return obj.map(item => pickFields(item, fields));
  }
  if (obj !== null && typeof obj === "object") {
    const result: any = {};
    for (const field of fields) {
      if (field in obj) {
        result[field] = obj[field];
      }
    }
    // If we picked nothing, return a snippet of the original object to avoid empty results
    if (Object.keys(result).length === 0 && fields.length > 0) {
      return { _info: "Fields not found", sample_keys: Object.keys(obj).slice(0, 5) };
    }
    return result;
  }
  return obj;
}

export const readFileTool: any = {
  description: "Read the contents of a file. Use this before editing any file.",
  parameters: z.object({
    path: z.string().describe("Absolute or relative path to the file"),
    start_line: z.number().optional().describe("Optional: start reading from this line"),
    end_line: z.number().optional().describe("Optional: stop reading at this line"),
    skeleton_mode: z.boolean().optional().describe("If true, returns only the AST skeleton (class, functions) extracting code structure. Hugely saves tokens.")
  }),
  execute: async (args: any) => {
    const { path: fPath, start_line, end_line, skeleton_mode } = args;
    try {
      const absolutePath = resolveSafePath(fPath);
      
      // Safety Checks
      const stats = await fs.stat(absolutePath).catch(() => null);
      if (!stats) return `Error: File not found at ${fPath}`;

      // Security check (Allow reading from CWD or ~/.hiru)
      if (!isSafePath(absolutePath)) {
        return `Error: Permission denied for reading path: ${fPath}. You can only read within the project directory or ~/.hiru/`;
      }

      if (stats.isDirectory()) return `Error: ${fPath} is a directory. Use list_files to see its content.`;
      
      // Size limit (2MB) - prevent token blowup and hangs
      const MAX_SIZE = 2 * 1024 * 1024; 
      if (stats.size > MAX_SIZE && start_line === undefined && !skeleton_mode) {
         return `Error: File is too large (${(stats.size/1024/1024).toFixed(2)} MB). Please use start_line and end_line to read it in segments.`;
      }

      const content = await fs.readFile(absolutePath, "utf8");

      if (skeleton_mode) {
        const ext = path.extname(absolutePath).toLowerCase();
        if (['.ts', '.js', '.jsx', '.tsx', '.py'].includes(ext)) {
          const lines = content.split('\n');
          const skeleton = [];
          for (let i = 0; i < lines.length; i++) {
             const line = lines[i];
             // Grab definitions: class, function, async function, interface, type, exports
             if (/^\s*(export\s+)?(default\s+)?(async\s+)?(class|function|interface|type)\b/.test(line) ||
                 /^\s*(export\s+)?(const|let|var)\s+\w+\s*=/.test(line) ||
                 /^\s*def\s+/.test(line)) {
                 skeleton.push(`${i + 1}: ${line.slice(0, 100).trim()}`);
             }
          }
          if (skeleton.length > 0) {
             return `[SKELETON MODE] Core structure of ${fPath}:\n` + skeleton.join('\n') + `\n\nTo view implementations, use read_file with start_line and end_line based on the line numbers above.`;
          }
        }
      }

      if (start_line !== undefined || end_line !== undefined) {
        const lines = content.split('\n');
        const start = start_line ? Math.max(0, start_line - 1) : 0;
        const end = end_line ? Math.min(lines.length, end_line) : lines.length;
        return lines.slice(start, end).join('\n');
      }
      return content;
    } catch (e: any) {
      const structured = ErrorHandler.handle("read_file", e);
      return ErrorHandler.format(structured);
    }
  }
};

export const writeFileTool: any = {
  requiresPermission: false, 
  description: `Write content to a file. Creates the file and any parent directories if they don't exist.
The file path argument MUST be provided as "path" key.
Example: { "path": "src/index.html", "content": "<html>..." }`,
  parameters: z.object({
    path: z.string().describe("File path relative to working directory. Example: 'index.html' or 'src/utils.ts'"),
    content: z.string().describe("Full content to write to the file")
  }),
  execute: async (args: any) => {
    // 1. Path Fallback
    const fPath = (args.path ?? args.file_path ?? args.filename ?? args.file ?? args.filepath ?? args.name) as string;
    if (!fPath || typeof fPath !== "string") {
      throw new Error(`write_file: missing required argument "path". Received keys: ${Object.keys(args).join(", ")}`);
    }

    // 2. Content Fallback
    const content = (args.content ?? args.text ?? args.data ?? args.body ?? "") as string;
    if (typeof content !== "string") {
      throw new Error(`write_file: "content" must be a string, got ${typeof content}`);
    }

    const absolutePath = resolveSafePath(fPath);
    
    // Security check (Allow writing to CWD or ~/.hiru)
    if (!isSafePath(absolutePath)) {
      throw new Error(`write_file: permission denied for path: ${fPath}. You can only write within the project directory or ~/.hiru/file/`);
    }

    try {
      await writeFileWithProgress(absolutePath, content, "write", currentProgressCallback || undefined);
      
      // ✨ Post-write verification
      const validation = await ToolValidator.validateWrite(absolutePath, content);
      if (!validation.valid) {
        throw new Error(`write_file completed but verification failed: ${validation.message}`);
      }

      return validation.message;
    } catch (e: any) {
      throw new Error(`write_file failed: ${e.message}`);
    }
  }
};

export const editFileTool: any = {
  requiresPermission: false,
  description: `Surgically edit a file. You can replace a block of code by specifying its line range AND provide the expected content for verification.
IMPORTANT: Use this instead of rewrite_file for small changes. Provide exact line numbers from read_file.`,
  parameters: z.object({
    path: z.string().describe("Path to file"),
    start_line: z.number().optional().describe("First line of the block to replace (1-indexed)"),
    end_line: z.number().optional().describe("Last line of the block to replace (1-indexed)"),
    old_content: z.string().describe("The exact text you expect to find at that location. MUST match exactly."),
    new_content: z.string().describe("The replacement text")
  }),
  execute: async (args: any) => {
    const fPath = (args.path ?? args.file_path ?? args.filename) as string;
    const { start_line, end_line, old_content, new_content } = args;
    
    try {
      const absolutePath = resolveSafePath(fPath);

      // Security check
      if (!isSafePath(absolutePath)) {
        throw new Error(`edit_file: permission denied for path: ${fPath}. You can only edit within the project directory or ~/.hiru/`);
      }

      const content = await fs.readFile(absolutePath, "utf8");
      const lines = content.split("\n");

      if (start_line !== undefined && end_line !== undefined) {
        // Line-based replacement
        const startIdx = start_line - 1;
        const endIdx = end_line; // lines.slice(start, end) is exclusive of end index
        
        if (startIdx < 0 || endIdx > lines.length || startIdx >= endIdx) {
          throw new Error(`Invalid line range: ${start_line}-${end_line}. File has ${lines.length} lines.`);
        }

        const targetLines = lines.slice(startIdx, endIdx);
        const actualBlock = targetLines.join("\n");

        if (actualBlock.trim() !== old_content.trim()) {
           // Provide helpful diff in error
           throw new Error([
             `Content mismatch at lines ${start_line}-${end_line}.`,
             `EXPECTED: ${old_content.slice(0, 100)}${old_content.length > 100 ? "..." : ""}`,
             `ACTUAL:   ${actualBlock.slice(0, 100)}${actualBlock.length > 100 ? "..." : ""}`,
             `Tip: Ensure you read the file first to get the latest line numbers and content.`
           ].join("\n"));
        }

        const newLines = [...lines];
        newLines.splice(startIdx, endIdx - startIdx, new_content);
        const finalContent = newLines.join("\n");
        await writeFileWithProgress(absolutePath, finalContent, "edit", currentProgressCallback || undefined);
        return `Successfully replaced lines ${start_line}-${end_line} in ${fPath}.`;
      } else {
        // Global exact match replacement (legacy backup)
        const occurrences = content.split(old_content).length - 1;
        if (occurrences === 0) {
          throw new Error(`old_content not found in ${fPath}.`);
        }
        if (occurrences > 1) {
          throw new Error(`old_content found ${occurrences} times. Use line numbers to target a specific instance.`);
        }
        const finalContent = content.replace(old_content, new_content);
        await writeFileWithProgress(absolutePath, finalContent, "edit", currentProgressCallback || undefined);
        return `Successfully replaced one occurrence of content in ${fPath}.`;
      }
    } catch (e: any) {
      throw e;
    }
  }
};

export const listFilesTool: any = {
  description: "List files and directories.",
  parameters: z.object({
    path: z.string().optional().describe("Directory path"),
    recursive: z.boolean().default(false),
  }),
  execute: async (args: any) => {
    const dPath = (args.path ?? args.directory ?? args.folder ?? args.dir ?? ".") as string;
    const recursive = !!args.recursive;
    try {
      const p = resolveSafePath(dPath);
      
      // Security check
      if (!isSafePath(p)) {
        return `Error: Permission denied for listing path: ${dPath}. You can only list within the project directory or ~/.hiru/`;
      }

      const entries = await fs.readdir(p, { recursive });
      return `Files:\n${entries.join('\n')}`;
    } catch (e: any) {
       throw new Error(`Error listing files: ${e.message}`);
    }
  }
};

export const runShellTool: any = {
  requiresPermission: (args: any) => {
    const cmd = (args.command || args.cmd || "").trim().toLowerCase();

    // mkdir -p adalah safe untuk project creation — jangan block
    // rmdir juga relatif safe — hanya hapus direktori kosong
    // cp dan mv dibutuhkan saat agent merestrukturisasi file
    const dangerous = [
      "rm ", "rm\t",          // rm tapi bukan rmdir
      "del ",
      "npm publish",
      "kill ",
      "sudo ",
      "docker ",
      "chmod ",
      "chown ",
      "reboot",
      "shutdown",
      "format",
      "dd ",
    ];

    // Exact match untuk single-word commands berbahaya
    const dangerousExact = ["rm", "del", "reboot", "shutdown"];

    return (
      dangerous.some((d) => cmd.startsWith(d)) ||
      dangerousExact.includes(cmd)
    );
  },
  description: `Execute a shell command. 
IMPORTANT: 
- Do NOT run long-running servers (npx serve, npm start, python -m http.server, etc.)
- Only run commands that FINISH: npm install, npm run build, node --version, etc.
- If you need to test a website, just confirm the files exist instead.
- Default timeout: 30 seconds. Long commands may be killed.`,
  parameters: z.object({
    command: z.string(),
    cwd: z.string().optional().describe("Working directory"),
    timeout_ms: z.number().optional().default(30000).describe("Max ms to wait. Default 30000. Max 60000.")
  }),
  execute: async (args: any) => {
    const command = (args.command ?? args.cmd) as string;
    if (!command) throw new Error("run_shell: missing required argument 'command'");

    // 1. Server detection (Fix Masalah 1: Comprehensive patterns)
    const SERVER_PATTERNS = [
      // npm/yarn/pnpm/bun scripts yang biasanya server
      /npm\s+(run\s+)?(dev|start|serve|watch|preview)\b/,
      /pnpm\s+(run\s+)?(dev|start|serve|watch|preview)\b/,
      /yarn\s+(run\s+)?(dev|start|serve|watch|preview)\b/,
      /bun\s+(run\s+)?(dev|start|serve|watch|preview)\b/,

      // Tools server langsung
      /npx\s+serve\b/,
      /npx\s+vite(\s|$)/,
      /npx\s+next\s+dev/,
      /npx\s+nuxt\s+dev/,
      /python.*http\.server/,
      /python.*-m\s+http/,
      /node\s+server\./,
      /live-server/,
      /http-server/,
      /browser-sync/,
      /webpack.*--watch/,
      /webpack-dev-server/,
      /nodemon\b/,
      /ts-node-dev\b/,

      // Binaries langsung
      /^vite(\s|$)/,
      /^next\s+dev/,
      /^nuxt\s+dev/,
      /^astro\s+dev/,
      /^remix\s+dev/,
      /^sveltekit\s+dev/,
    ];

    if (SERVER_PATTERNS.some(p => p.test(command))) {
      return [
        `[BLOCKED] "${command}" is a long-running server \u2014 it would hang indefinitely.`,
        ``,
        `To test your project:`,
        `  1. Open index.html directly in browser (for plain HTML/CSS/JS)`,
        `  2. Or run manually in a separate terminal: ${command}`,
        `  3. Or use: npm run build (to get static output)`,
        ``,
        `All files have been created and are ready to use.`,
      ].join("\n");
    }

    // 2. Slow but OK commands (install, build)
    const SLOW_BUT_OK = [
      /npm\s+(install|i|ci|run\s+build)\b/,
      /pnpm\s+(install|i|run\s+build)\b/,
      /yarn\s+(install|build)\b/,
      /bun\s+(install|i|run\s+build)\b/,
      /npx\s+(create-|tsc\b)/,
    ];

    const isSlowCommand = SLOW_BUT_OK.some(p => p.test(command));
    const timeout = isSlowCommand ? 120000 : Math.min(Number(args.timeout_ms ?? 30000), 60000);
    const cwd = args.cwd ? resolveSafePath(args.cwd) : process.cwd();

    try {
      const proc = execa(command, {
        shell: true,
        cwd,
        timeout,
        reject: false,
        all: true, 
      });

      // Stream output live (Fix: Live terminal logs)
      if (proc.all) {
        proc.all.on("data", (chunk: Buffer) => {
          const text = chunk.toString();
          toolEvents.emit("shell-output", { text });
        });
      }

      const result = await proc;
      const { all, exitCode, timedOut } = result;

      const output = (all ?? "").trim();
      const MAX_OUTPUT = 12000;
      const truncated = output.length > MAX_OUTPUT 
        ? output.slice(0, MAX_OUTPUT) + `\n[... truncated ${output.length - MAX_OUTPUT} chars]` 
        : output;

      if (timedOut) {
        return [
          `[COMMAND] ${command}`,
          `[TIMEOUT] Command timed out after ${timeout / 1000}s.`,
          `[PARTIAL OUTPUT]`,
          truncated,
        ].join("\n");
      }

      // Deteksi error keywords di output (Fix Masalah 2B)
      const ERROR_KEYWORDS = [
        "Error:", "error:", "ERR!", "npm error", "ENOENT", "EACCES",
        "SyntaxError", "TypeError", "ReferenceError", "Cannot find module",
        "Module not found", "Cannot resolve", "not found", "failed",
        "FAILED", "Build failed", "Compilation failed",
      ];

      const hasErrorInOutput = ERROR_KEYWORDS.some(kw => output.includes(kw));
      const isActualError = exitCode !== 0 || hasErrorInOutput;

      if (isActualError) {
        return [
          `[COMMAND] ${command}`,
          `[ERROR] Command finished with issues (exit ${exitCode}).`,
          `[OUTPUT]`,
          truncated || "(no output)",
          ``,
          `[ACTION REQUIRED] Analyze the output above, fix the issues, and retry if necessary.`,
        ].join("\n");
      }

      return [
        `[COMMAND] ${command}`,
        `[SUCCESS] exit ${exitCode}`,
        `[OUTPUT]`,
        truncated || "(no output)",
      ].join("\n");
    } catch (e: any) {
      return `[COMMAND] ${command}\n[FATAL ERROR] run_shell failed to even start: ${e.message}`;
    }
  }
};

export const createFileTool: any = {
  description: `Create a new file with content. Alias of write_file.
Path MUST be provided as "path" key. Creates parent directories automatically.`,
  parameters: z.object({
    path: z.string().describe("File path relative to working directory. Example: 'src/app.ts'"),
    content: z.string().describe("Full content to write to the file")
  }),
  execute: writeFileTool.execute,
};

export const searchFilesTool: any = {
  description: "Search for text patterns across files in the project.",
  parameters: z.object({
    pattern: z.string().describe("Text or regex pattern to search"),
    path: z.string().optional().default(".").describe("Directory to search in"),
    file_pattern: z.string().optional().describe("File glob, e.g. '*.ts'"),
  }),
  execute: async (args: any) => {
    const { pattern, path: searchPath = ".", file_pattern } = args;
    const resolvedSearchPath = resolveSafePath(searchPath);

    // Security check
    if (!isSafePath(resolvedSearchPath)) {
      return `Error: Permission denied for searching path: ${searchPath}. You can only search within the project directory or ~/.hiru/`;
    }

    // Coba ripgrep dulu, fallback ke grep
    const cmd = file_pattern
      ? `rg --no-heading -n "${pattern}" --glob "${file_pattern}" "${resolvedSearchPath}" 2>/dev/null || grep -rn "${pattern}" --include="${file_pattern}" "${resolvedSearchPath}"`
      : `rg --no-heading -n "${pattern}" "${resolvedSearchPath}" 2>/dev/null || grep -rn "${pattern}" "${resolvedSearchPath}"`;

    try {
      const result = await execa(cmd, {
        shell: true,
        cwd: process.cwd(),
        reject: false,
        timeout: 15000,
      });

      const output = (result.stdout || "").trim();
      if (!output) return "No matches found.";
      
      const lines = output.split("\n");
      const truncated = lines.slice(0, 100);
      return truncated.join("\n") + (lines.length > 100 ? `\n\n[... truncated ${lines.length - 100} matches]` : "");
    } catch (e: any) {
      return `Search error: ${e.message}`;
    }
  },
};

export const fetchApiTool: any = {
  description: "Fetch data from an API. Supports JSON field filtering to save tokens.",
  parameters: z.object({
    url: z.string().describe("The URL to fetch"),
    method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("GET"),
    headers: z.record(z.string()).optional().describe("Optional HTTP headers"),
    body: z.string().optional().describe("Optional request body"),
    select_fields: z.array(z.string()).optional().describe("Optional: list of fields to keep from the JSON (e.g. ['name', 'price'])"),
  }),
  execute: async (args: any) => {
    const { url, method = "GET", headers, body, select_fields } = args;
    try {
      // @ts-ignore - using global fetch (Node 18+)
      const response = await fetch(url, {
        method,
        headers: headers || {},
        body: body || undefined,
      });

      if (!response.ok) {
        return `Error: API returned ${response.status} ${response.statusText}`;
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await response.json();
        if (select_fields && select_fields.length > 0) {
          const filtered = pickFields(json, select_fields);
          return JSON.stringify(filtered, null, 2);
        }
        return JSON.stringify(json, null, 2);
      } else {
        const text = await response.text();
        return text.slice(0, 10000); // Safety limit for text responses
      }
    } catch (e: any) {
      return `Fetch error: ${e.message}`;
    }
  }
};

// Desktop Tools
import { readWebPageTool }   from "./browser/readPage.js";
import { openAppTool }        from "./desktop/openApp.js";
import { typeTextTool }       from "./desktop/typeText.js";
import { pressKeyTool }       from "./desktop/pressKey.js";
import { takeScreenshotTool } from "./desktop/takeScreenshot.js";
import { examineImageTool }  from "./desktop/examineImage.js";
import { moveMouseTool }      from "./desktop/moveMouse.js";
import { inspectUITool }      from "./desktop/inspectUI.js";
import { scrollMouseTool }    from "./desktop/scrollMouse.js";
import { clickElementTool }   from "./desktop/clickElement.js";
import { waitThenScreenshotTool } from "./desktop/waitThenScreenshot.js";
import { dragDropTool }      from "./desktop/dragDrop.js";


export const internalTools: any = {
  // === FILE TOOLS ===
  read_file:    readFileTool,
  write_file:   writeFileTool,
  create_file:  createFileTool,
  edit_file:    editFileTool,
  list_files:   listFilesTool,
  search_files: searchFilesTool,
  run_shell:    runShellTool,
  fetch_api:    fetchApiTool,
  update_plan:  UpdatePlanTool,

  // === DESKTOP TOOLS ===
  open_app:        openAppTool,
  type_text:       typeTextTool,
  press_key:       pressKeyTool,
  take_screenshot: takeScreenshotTool,
  examine_image:   examineImageTool,
  move_mouse:           moveMouseTool,
  inspect_ui:           inspectUITool,
  read_web_page:        readWebPageTool,
  scroll_mouse:         scrollMouseTool,
  click_element:        clickElementTool,
  wait_then_screenshot: waitThenScreenshotTool,
  drag_drop:            dragDropTool,
};
