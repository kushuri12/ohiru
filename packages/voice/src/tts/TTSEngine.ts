export interface TTSOptions {
  voiceId?: string;
  speed?: number;
  pitch?: number;
}

export interface TTSEngine {
  speak(text: string, options?: TTSOptions): Promise<string>; // returns path to audio file
  getVoices(): Promise<string[]>;
}

export class TTSChain implements TTSEngine {
  constructor(private engines: TTSEngine[]) {}

  public async speak(text: string, options?: TTSOptions): Promise<string> {
    for (const engine of this.engines) {
      try {
        return await engine.speak(text, options);
      } catch (err) {
        console.warn(`TTS Engine failed, trying next...`);
      }
    }
    throw new Error("All TTS engines failed");
  }

  public async getVoices(): Promise<string[]> {
    const voices = new Set<string>();
    for (const engine of this.engines) {
      (await engine.getVoices()).forEach(v => voices.add(v));
    }
    return Array.from(voices);
  }
}
