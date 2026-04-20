import { EventEmitter } from "events";
import { spawn, exec } from "child_process";
import { createReadStream, createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import path from "path";
import os from "os";
import chalk from "chalk";

export interface VoiceConfig {
  wakeWord: string;
  sensitivity: number;
  platform: "macos" | "ios" | "android" | "linux";
  ttsProvider?: string;
  sttProvider?: string;
  pushToTalk?: boolean;
}

export class WakeWordDetector extends EventEmitter {
  private config: VoiceConfig;
  private isListening: boolean = false;
  private process: any;
  private audioBuffer: Buffer[] = [];

  constructor(config: VoiceConfig) {
    super();
    this.config = config;
  }

  public async start(): Promise<void> {
    this.isListening = true;
    console.log(chalk.cyan(`[WakeWord] Starting on ${this.config.platform} for "${this.config.wakeWord}"...`));

    switch (this.config.platform) {
      case "macos":
        await this.startMacOS();
        break;
      case "ios":
        await this.startiOS();
        break;
      case "android":
        await this.startAndroid();
        break;
      default:
        await this.startGeneric();
    }
  }

  private async startMacOS(): Promise<void> {
    if (this.config.pushToTalk) {
      exec(`osascript -e 'tell app "System Events" to key code 49'`, (err) => {
        if (!err) this.emit("wake");
      });
    } else {
      console.log(chalk.cyan(`[WakeWord] macOS: Using SoX or Picovoice for wake word detection`));
    }
  }

  private async startiOS(): Promise<void> {
    console.log(chalk.cyan(`[WakeWord] iOS: Configure via OpenClaw iOS app`));
  }

  private async startAndroid(): Promise<void> {
    console.log(chalk.cyan(`[WakeWord] Android: Enabling continuous voice mode`));
  }

  private async startGeneric(): Promise<void> {
    console.log(chalk.cyan(`[WakeWord] Using WebRTC VAD or Picovoice`));
  }

  public stop(): void {
    this.isListening = false;
    if (this.process) {
      this.process.kill();
    }
  }

  public isActive(): boolean {
    return this.isListening;
  }
}

export class VoiceWakeManager extends EventEmitter {
  private detectors: Map<string, WakeWordDetector> = new Map();
  private activeSession: string | null = null;

  constructor() {
    super();
  }

  public addDetector(id: string, config: VoiceConfig): WakeWordDetector {
    const detector = new WakeWordDetector(config);
    detector.on("wake", () => this.emit("wake", id));
    this.detectors.set(id, detector);
    return detector;
  }

  public async startAll(): Promise<void> {
    for (const detector of this.detectors.values()) {
      await detector.start();
    }
  }

  public stopAll(): void {
    for (const detector of this.detectors.values()) {
      detector.stop();
    }
  }

  public setActiveSession(id: string | null): void {
    this.activeSession = id;
    this.emit("session", id);
  }

  public getActiveSession(): string | null {
    return this.activeSession;
  }
}