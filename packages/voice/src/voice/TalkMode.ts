import { EventEmitter } from "events";
import { pipeline } from "stream/promises";
import { createReadStream, createWriteStream, mkdirSync, existsSync } from "fs";
import path from "path";
import os from "os";
import chalk from "chalk";
import { spawn, exec } from "child_process";
import axios from "axios";
import FormData from "form-data";

export interface TalkModeConfig {
  platform: "macos" | "ios" | "android" | "linux";
  ttsProvider: "elevenlabs" | "openai" | "system" | "google";
  sttProvider: "whisper" | "google" | "azure";
  continuous: boolean;
  pushToTalk?: boolean;
  voiceId?: string;
}

export class TalkMode extends EventEmitter {
  private config: TalkModeConfig;
  private isActive: boolean = false;
  private isSpeaking: boolean = false;
  private audioChunks: Buffer[] = [];

  constructor(config: TalkModeConfig) {
    super();
    this.config = config;
  }

  public async start(): Promise<void> {
    this.isActive = true;
    console.log(chalk.cyan(`[TalkMode] Started on ${this.config.platform} - continuous: ${this.config.continuous}`));
  }

  public async speak(text: string): Promise<void> {
    if (!this.isActive) return;
    this.isSpeaking = true;
    this.emit("speaking");

    try {
      switch (this.config.ttsProvider) {
        case "elevenlabs":
          await this.speakWithElevenLabs(text);
          break;
        case "openai":
          await this.speakWithOpenAI(text);
          break;
        case "google":
          await this.speakWithGoogle(text);
          break;
        default:
          await this.speakWithSystem(text);
      }
    } catch (err) {
      console.error(chalk.red(`[TalkMode] TTS error: ${err}`));
    }

    this.isSpeaking = false;
    this.emit("done");
  }

  private async speakWithElevenLabs(text: string): Promise<void> {
    const voiceId = this.config.voiceId || "EXAVITQu4vr4xnSDxMaL";
    const response = await axios({
      method: "POST",
      url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      data: { text, voice_settings: { stability: 0.5, similarity_boost: 0.75 } },
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
      responseType: "arraybuffer"
    });
    await this.playAudio(Buffer.from(response.data));
  }

  private async speakWithOpenAI(text: string): Promise<void> {
    const response = await axios({
      method: "POST",
      url: "https://api.openai.com/v1/audio/speech",
      data: { model: "tts-1", input: text, voice: "alloy" },
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      responseType: "arraybuffer"
    });
    await this.playAudio(Buffer.from(response.data));
  }

  private async speakWithGoogle(text: string): Promise<void> {
    console.log(chalk.cyan(`[TalkMode] Google TTS: ${text}`));
  }

  private async speakWithSystem(text: string): Promise<void> {
    const tempFile = path.join(os.tmpdir(), `hiru_tts_${Date.now()}.wav`);
    if (process.platform === "darwin") {
      await execPromise(`say "${text}"`);
    } else if (process.platform === "linux") {
      await execPromise(` espeak "${text}"`);
    }
  }

  private async playAudio(buffer: Buffer): Promise<void> {
    const tempFile = path.join(os.tmpdir(), `hiru_audio_${Date.now()}.mp3`);
    require("fs").writeFileSync(tempFile, buffer);
    
    const playerCmd = process.platform === "darwin" ? "afplay" : "mpg123";
    return new Promise((resolve) => {
      const player = spawn(playerCmd, [tempFile], { 
        stdio: "ignore",
        shell: true 
      });
      player.on("close", () => {
        require("fs").unlinkSync(tempFile);
        resolve();
      });
    });
  }

  public async listen(): Promise<string> {
    if (this.config.platform === "macos" && !this.config.pushToTalk) {
      return this.listenMacOSPushToTalk();
    }
    return this.listenGeneric();
  }

  private async listenMacOSPushToTalk(): Promise<string> {
    return new Promise((resolve) => {
      exec(`osascript -e 'display notification "Push to talk" with title "Hiru"'`);
      setTimeout(() => resolve(""), 5000);
    });
  }

  private async listenGeneric(): Promise<string> {
    console.log(chalk.cyan(`[TalkMode] Listening...`));
    return "";
  }

  public stop(): void {
    this.isActive = false;
    this.isSpeaking = false;
  }

  public isRunning(): boolean {
    return this.isActive;
  }
}

function execPromise(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    require("child_process").exec(cmd, (err: any, stdout: string) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

export class VoiceNodeManager extends EventEmitter {
  private nodes: Map<string, { platform: string; status: string }> = new Map();

  constructor() {
    super();
  }

  public registerNode(id: string, platform: string): void {
    this.nodes.set(id, { platform, status: "online" });
    console.log(chalk.green(`[VoiceNode] Registered ${platform} node: ${id}`));
  }

  public unregisterNode(id: string): void {
    this.nodes.delete(id);
  }

  public getNodes(): Map<string, { platform: string; status: string }> {
    return this.nodes;
  }
}