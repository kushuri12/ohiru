import fetch from "node-fetch";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { TTSEngine, TTSOptions } from "./TTSEngine.js";

export class ElevenLabsTTS implements TTSEngine {
  private apiKey: string;
  private cacheDir: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.cacheDir = path.join(os.homedir(), ".hiru", "voice", "cache");
    fs.ensureDirSync(this.cacheDir);
  }

  public async speak(text: string, options?: TTSOptions): Promise<string> {
    const voiceId = options?.voiceId || "pNInz6obpgHMo65oU6T2"; // Default voice
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    
    // Hash text + voiceId to use as cache key
    const fileName = Buffer.from(text + voiceId).toString("base64").slice(0, 32) + ".mp3";
    const filePath = path.join(this.cacheDir, fileName);

    if (await fs.pathExists(filePath)) return filePath;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5,
        },
      }),
    });

    if (!response.ok) throw new Error(`ElevenLabs API failed: ${response.statusText}`);

    const buffer = await response.buffer();
    await fs.writeFile(filePath, buffer);
    return filePath;
  }

  public async getVoices(): Promise<string[]> {
    const response = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": this.apiKey },
    });
    const data: any = await response.json();
    return data.voices.map((v: any) => v.voice_id);
  }
}
