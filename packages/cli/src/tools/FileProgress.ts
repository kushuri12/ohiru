import { EventEmitter } from "events";
import fs from "node:fs/promises";
import path from "node:path";

export interface FileProgressEvent {
  type: "progress" | "complete" | "error";
  fileName: string;
  operation: "write" | "edit";
  linesWritten: number;
  totalLines: number;
  bytesWritten: number;
  totalBytes: number;
  percent: number;
  elapsedMs: number;
  message: string;
}

export type ProgressCallback = (event: FileProgressEvent) => void;

export const globalFileProgress = new EventEmitter();

/**
 * Write a file with real-time progress reporting.
 * Non-blocking: atomic write completes immediately, progress animation
 * runs in background via setImmediate so it doesn't block tool execution.
 */
export async function writeFileWithProgress(
  filePath: string,
  content: string,
  operation: "write" | "edit" = "write",
  callback?: ProgressCallback
): Promise<void> {
  const lines = content.split("\n");
  const totalLines = lines.length;
  const totalBytes = Buffer.byteLength(content, "utf8");
  const startTime = Date.now();

  try {
    const dirPath = path.dirname(filePath);
    if (dirPath && dirPath !== ".") {
      await fs.mkdir(dirPath, { recursive: true });
    }

    // ATOMIC WRITE — langsung selesai, tidak ada delay
    await fs.writeFile(filePath, content, "utf8");

    // Emit progress di background (non-blocking) untuk UI saja
    // Gunakan setImmediate agar tidak memblokir caller
    const emitBackgroundProgress = () => {
      const TARGET_FRAMES = 15; // Kurangi frame untuk performa
      const chunkSize = Math.max(10, Math.ceil(lines.length / TARGET_FRAMES));
      let frame = 0;

      const tick = () => {
        const reported = Math.min((frame + 1) * chunkSize, totalLines);
        const bytesReported = Math.round((reported / totalLines) * totalBytes);
        const elapsedMs = Date.now() - startTime;
        const percent = Math.round((reported / totalLines) * 100);

        const event: FileProgressEvent = {
          type: reported >= totalLines ? "complete" : "progress",
          fileName: path.basename(filePath),
          operation,
          linesWritten: reported,
          totalLines,
          bytesWritten: bytesReported,
          totalBytes,
          percent,
          elapsedMs,
          message: `${percent}% | ${reported}/${totalLines} lines`,
        };

        if (callback) callback(event);
        globalFileProgress.emit("fileProgress", event);

        frame++;
        if (reported < totalLines) {
          // setTimeout 0 agar tidak memblokir event loop tapi tetap ada animasi
          setTimeout(tick, 0);
        }
      };

      setImmediate(tick);
    };

    emitBackgroundProgress();

  } catch (e: any) {
    const errorEvent: FileProgressEvent = {
      type: "error",
      fileName: path.basename(filePath),
      operation,
      linesWritten: 0,
      totalLines,
      bytesWritten: 0,
      totalBytes,
      percent: 0,
      elapsedMs: Date.now() - startTime,
      message: `Error: ${e.message}`,
    };
    if (callback) callback(errorEvent);
    globalFileProgress.emit("fileProgress", errorEvent);
    throw e;
  }
}
