export interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
  segments?: any[];
}

export interface STTEngine {
  transcribe(audioPath: string, options?: { language?: string }): Promise<TranscriptionResult>;
}

export class STTChain implements STTEngine {
  constructor(private engines: STTEngine[]) {}

  public async transcribe(audioPath: string, options?: { language?: string }): Promise<TranscriptionResult> {
    for (const engine of this.engines) {
      try {
        return await engine.transcribe(audioPath, options);
      } catch (err) {
        console.warn(`STT Engine failed, trying next...`);
      }
    }
    throw new Error("All STT engines failed");
  }
}
