import { execa } from "execa";
import path from "path";
import os from "os";
import fs from "fs-extra";
import chalk from "chalk";

export class AudioRecorder {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(os.homedir(), ".hiru", "voice", "temp");
    fs.ensureDirSync(this.tempDir);
  }

  public async record(options: { durationMs: number }): Promise<string> {
    const filePath = path.join(this.tempDir, `rec_${Date.now()}.wav`);
    
    try {
      if (process.platform === "darwin") {
        // Use sox or ffmpeg if available, or rec
        await execa("rec", ["-c", "1", "-r", "16000", filePath, "trim", "0", (options.durationMs / 1000).toString()]);
      } else if (process.platform === "win32") {
        // Windows record via PowerShell is complex, usually requires external tool like sox
        console.warn("[AudioRecorder] Windows recording requires 'sox' installed");
        await execa("sox", ["-d", "-c", "1", "-r", "16000", filePath, "trim", "0", (options.durationMs / 1000).toString()]);
      } else {
        await execa("arecord", ["-f", "S16_LE", "-r", "16000", "-d", (options.durationMs / 1000).toString(), filePath]);
      }
      return filePath;
    } catch (err) {
      console.error(chalk.red(`[AudioRecorder] Recording failed: ${err}`));
      throw err;
    }
  }
}
