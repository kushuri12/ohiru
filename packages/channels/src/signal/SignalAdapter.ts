import { execa } from "execa";
import { ChannelAdapter } from "../shared/ChannelAdapter.js";
import { InboundMessage } from "../shared/InboundMessage.js";
import { OutboundMessage } from "../shared/OutboundMessage.js";
import { ChannelStatus, ChannelType } from "../shared/types.js";
import { EventEmitter } from "events";
import chalk from "chalk";

export class SignalAdapter extends EventEmitter implements ChannelAdapter {
  public id: string;
  public type: ChannelType = "signal";
  private status: ChannelStatus = "disconnected";
  private phoneNumber: string;
  private signalCliPath: string;

  constructor(id: string, phoneNumber: string, signalCliPath: string = "signal-cli") {
    super();
    this.id = id;
    this.phoneNumber = phoneNumber;
    this.signalCliPath = signalCliPath;
  }

  public async connect(): Promise<void> {
    try {
      // Verify signal-cli is working
      await execa(this.signalCliPath, ["--version"]);
      this.status = "connected";
      console.log(chalk.green(`[Signal] Adapter connected using ${this.phoneNumber}`));
      this.startPolling();
    } catch (err) {
      this.status = "error";
      console.error(chalk.red(`[Signal] Failed to connect: ${err}`));
    }
  }

  private async startPolling() {
     // signal-cli receive is usually done via a daemon or polling
     // Simplified polling mechanism for this implementation
     setInterval(async () => {
       if (this.status !== "connected") return;
       try {
         const { stdout } = await execa(this.signalCliPath, ["-u", this.phoneNumber, "receive", "--json"]);
         if (stdout) {
           const lines = stdout.split("\n");
           for (const line of lines) {
             if (!line.trim()) continue;
             const msg = JSON.parse(line);
             if (msg.envelope && msg.envelope.dataMessage) {
                const inbound: InboundMessage = {
                  id: msg.envelope.timestamp.toString(),
                  channelId: this.id,
                  channelType: this.type,
                  peerId: msg.envelope.sourceNumber || msg.envelope.sourceUuid,
                  peerName: msg.envelope.sourceName || "Signal User",
                  content: msg.envelope.dataMessage.message,
                  contentType: "text",
                  timestamp: Date.now(),
                  mentions: [],
                  metadata: { ...msg.envelope },
                };
                this.emit("message", inbound);
             }
           }
         }
       } catch (e) {
         // Silently fail polling
       }
     }, 5000);
  }

  public async disconnect(): Promise<void> {
    this.status = "disconnected";
  }

  public async send(peerId: string, message: OutboundMessage): Promise<void> {
    await execa(this.signalCliPath, ["-u", this.phoneNumber, "send", "-m", message.content, peerId]);
  }

  public isConnected(): boolean {
    return this.status === "connected";
  }

  public getStatus(): ChannelStatus {
    return this.status;
  }
}
