import { execa } from "execa";
import path from "path";
import os from "os";
import fs from "fs-extra";
import { TTSEngine, TTSOptions } from "./TTSEngine.js";

export class SystemTTS implements TTSEngine {
  private cacheDir: string;

  constructor() {
    this.cacheDir = path.join(os.homedir(), ".hiru", "voice", "cache");
    fs.ensureDirSync(this.cacheDir);
  }

  public async speak(text: string, options?: TTSOptions): Promise<string> {
    const fileName = `system_${Buffer.from(text).toString("base64").slice(0, 32)}.wav`;
    const filePath = path.join(this.cacheDir, fileName);

    if (await fs.pathExists(filePath)) return filePath;

    if (process.platform === "darwin") {
      await execa("say", ["-o", filePath, "--data-format=LEI16@16000", text]);
    } else if (process.platform === "win32") {
      const psCommand = `Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.SetOutputToWaveFile('${filePath}'); $synth.Speak('${text}'); $synth.Dispose();`;
      await execa("powershell", ["-Command", psCommand]);
    } else {
      await execa("espeak-ng", ["-w", filePath, text]);
    }

    return filePath;
  }

  public async getVoices(): Promise<string[]> {
    return ["default"];
  }
}
