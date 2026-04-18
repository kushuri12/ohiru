import { execa } from "execa";
import { STTEngine, TranscriptionResult } from "./STTEngine.js";
import path from "path";
import os from "os";

export class WhisperLocal implements STTEngine {
  private whisperPath: string;
  private modelPath: string;

  constructor(whisperPath: string = "whisper", modelPath?: string) {
    this.whisperPath = whisperPath;
    this.modelPath = modelPath || path.join(os.homedir(), ".hiru", "voice", "models", "ggml-base.en.bin");
  }

  public async transcribe(audioPath: string, options?: { language?: string }): Promise<TranscriptionResult> {
    const { stdout } = await execa(this.whisperPath, [
      "-m", this.modelPath,
      "-f", audioPath,
      "-l", options?.language || "en",
      "--output-json"
    ]);

    // whisper.cpp outputs a .json file with the same name as audioPath
    const jsonPath = audioPath + ".json";
    // In this simplified version, we'd read that file
    // For now we simulate the result from stdout if possible or just assume it worked
    
    return {
      text: stdout.trim(),
      language: options?.language || "en",
      duration: 0,
    };
  }
}
