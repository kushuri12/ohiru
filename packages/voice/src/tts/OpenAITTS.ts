import OpenAI from "openai";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { TTSEngine, TTSOptions } from "./TTSEngine.js";

export class OpenAITTS implements TTSEngine {
  private openai: OpenAI;
  private cacheDir: string;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
    this.cacheDir = path.join(os.homedir(), ".hiru", "voice", "cache");
    fs.ensureDirSync(this.cacheDir);
  }

  public async speak(text: string, options?: TTSOptions): Promise<string> {
    const voice = (options?.voiceId || "alloy") as any;
    const fileName = `openai_${Buffer.from(text + voice).toString("base64").slice(0, 32)}.mp3`;
    const filePath = path.join(this.cacheDir, fileName);

    if (await fs.pathExists(filePath)) return filePath;

    const mp3 = await this.openai.audio.speech.create({
      model: "tts-1",
      voice,
      input: text,
      speed: options?.speed || 1.0,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    await fs.writeFile(filePath, buffer);
    return filePath;
  }

  public async getVoices(): Promise<string[]> {
    return ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
  }
}
