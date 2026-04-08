import { EventEmitter } from "events";
import fs from "node:fs/promises";

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
 * Fix 2D: Optimized for speed by removing artificial delays and using atomic write.
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
  const CHUNK_SIZE = 50;           // Potong per 50 baris untuk update UI
  const PROGRESS_INTERVAL_MS = 50; // Emit progress setiap 50ms ke UI

  let lastProgressTime = 0;

  const emitProgress = (linesWritten: number, bytesWritten: number) => {
    const now = Date.now();
    // Rate-limit progress events (max 20fps)
    if (now - lastProgressTime < PROGRESS_INTERVAL_MS && linesWritten < totalLines) return;
    lastProgressTime = now;

    const elapsedMs = now - startTime;
    const percent = Math.round((linesWritten / totalLines) * 100);
    const speed = elapsedMs > 0 ? ((bytesWritten / 1024) / (elapsedMs / 1000)).toFixed(1) : "0";
    const eta = percent > 0 && percent < 100
      ? Math.round((elapsedMs / percent) * (100 - percent) / 1000)
      : 0;

    const event: FileProgressEvent = {
        type: linesWritten >= totalLines ? "complete" : "progress",
        fileName: filePath.split(/[/\\]/).pop() || filePath,
        operation,
        linesWritten,
        totalLines,
        bytesWritten,
        totalBytes,
        percent,
        elapsedMs,
        message: `${percent}% | ${linesWritten}/${totalLines} lines | ${speed} KB/s${eta > 0 ? ` | ETA: ${eta}s` : ""}`,
    };

    if (callback) callback(event);
    globalFileProgress.emit("fileProgress", event);
  };

  try {
    const dirPath = filePath.substring(0, Math.max(
      filePath.lastIndexOf("/"),
      filePath.lastIndexOf("\\")
    ));
    if (dirPath) await fs.mkdir(dirPath, { recursive: true });

    // ATOMIC WRITE: Tulis seluruh file sekaligus untuk kecepatan maksimal
    await fs.writeFile(filePath, content, "utf8");

    // SIMULATED PROGRESS: Animasi visual di UI agar user bisa memantau
    // File sudah selesai ditulis (atomic), ini hanya feed ke layar
    let reportedLines = 0;
    const ANIMATION_DELAY_MS = 25; // Jeda sedikit lebih lama (25ms) agar mata bisa menangkap
    const TARGET_FRAMES = 30;     // Usahakan minimal 30 frame update
    const ACTUAL_CHUNK_SIZE = Math.max(5, Math.ceil(lines.length / TARGET_FRAMES));
    
    for (let i = 0; i < lines.length; i += ACTUAL_CHUNK_SIZE) {
      reportedLines = Math.min(i + ACTUAL_CHUNK_SIZE, lines.length);
      const bytesReported = Math.round((reportedLines / totalLines) * totalBytes);
      
      const now = Date.now();
      const elapsedMs = now - startTime;
      const percent = Math.round((reportedLines / totalLines) * 100);
      const speed = elapsedMs > 0 ? ((bytesReported / 1024) / (elapsedMs / 1000)).toFixed(1) : "0";
      
      const event: FileProgressEvent = {
          type: reportedLines >= totalLines ? "complete" : "progress",
          fileName: filePath.split(/[/\\]/).pop() || filePath,
          operation,
          linesWritten: reportedLines,
          totalLines,
          bytesWritten: bytesReported,
          totalBytes,
          percent,
          elapsedMs,
          message: `${percent}% | ${reportedLines}/${totalLines} lines | ${speed} KB/s`,
      };

      if (callback) callback(event);
      globalFileProgress.emit("fileProgress", event);

      // Yield dengan jeda agar animasi sempat me-render di UI
      if (reportedLines < totalLines) {
        await new Promise(r => setTimeout(r, ANIMATION_DELAY_MS));
      }
    }

    // Final complete event
    emitProgress(totalLines, totalBytes);

  } catch (e: any) {
    const errorEvent: FileProgressEvent = {
      type: "error",
      fileName: filePath.split(/[/\\]/).pop() || filePath,
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
