import { EventEmitter } from "events";
import chalk from "chalk";

export class WakeWordDetector extends EventEmitter {
  private sensitivity: number;
  private wakeWord: string;
  private isListening: boolean = false;

  constructor(wakeWord: string = "Hey Hiru", sensitivity: number = 0.5) {
    super();
    this.wakeWord = wakeWord;
    this.sensitivity = sensitivity;
  }

  public async start(): Promise<void> {
    this.isListening = true;
    console.log(chalk.cyan(`[WakeWord] Listening for "${this.wakeWord}"...`));
    
    // In a real implementation with Picovoice:
    // const porcupine = new Porcupine(accessKey, [keywordPath], [this.sensitivity]);
    // while(this.isListening) { const pcm = await record(); if(porcupine.process(pcm) === 0) this.emit("wake"); }
  }

  public stop(): void {
    this.isListening = false;
  }
}
