import { TTSEngine } from "./tts/TTSEngine.js";
import { STTEngine } from "./stt/STTEngine.js";
import { WakeWordDetector } from "./wake/WakeWordDetector.js";
import { AudioPlayer } from "./audio/AudioPlayer.js";
import { AudioRecorder } from "./audio/AudioRecorder.js";
import chalk from "chalk";

export class VoiceSession {
  private tts: TTSEngine;
  private stt: STTEngine;
  private wake: WakeWordDetector;
  private player = new AudioPlayer();
  private recorder = new AudioRecorder();
  private agent: any;

  constructor(agent: any, tts: TTSEngine, stt: STTEngine, wake: WakeWordDetector) {
    this.agent = agent;
    this.tts = tts;
    this.stt = stt;
    this.wake = wake;

    this.wake.on("wake", () => this.startConversation());
  }

  public async start() {
    await this.wake.start();
  }

  private async startConversation() {
    console.log(chalk.bold.hex("#CC785C")(`\n 🎙️ Hiru is listening...`));
    
    try {
      // 1. Record
      const audioPath = await this.recorder.record({ durationMs: 5000 }); // auto-stop on silence in real impl

      // 2. STT
      const { text } = await this.stt.transcribe(audioPath);
      console.log(chalk.gray(` You said: "${text}"`));

      if (!text.trim()) return;

      // 3. Agent
      const response = await this.agent.chat(text);

      // 4. TTS
      const replyAudio = await this.tts.speak(response);

      // 5. Play
      await this.player.play(replyAudio);

    } catch (err) {
      console.error(chalk.red("[VoiceSession] Error:"), err);
    }
  }
}
