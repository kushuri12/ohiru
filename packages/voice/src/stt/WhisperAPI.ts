import OpenAI from "openai";
import fs from "fs-extra";
import { STTEngine, TranscriptionResult } from "./STTEngine.js";

export class WhisperAPI implements STTEngine {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  public async transcribe(audioPath: string, options?: { language?: string }): Promise<TranscriptionResult> {
    const response = await this.openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "whisper-1",
      language: options?.language,
      response_format: "verbose_json",
    });

    return {
      text: response.text,
      language: (response as any).language || "en",
      duration: (response as any).duration || 0,
      segments: (response as any).segments,
    };
  }
}
