import readline from "readline";
import { ChannelAdapter } from "../shared/ChannelAdapter.js";
import { InboundMessage } from "../shared/InboundMessage.js";
import { OutboundMessage } from "../shared/OutboundMessage.js";
import { ChannelStatus, ChannelType } from "../shared/types.js";
import { EventEmitter } from "events";
import chalk from "chalk";

export class CliChatAdapter extends EventEmitter implements ChannelAdapter {
  public id: string;
  public type: ChannelType = "cli-chat";
  private status: ChannelStatus = "disconnected";
  private rl: readline.Interface | null = null;

  constructor(id: string) {
    super();
    this.id = id;
  }

  public async connect(): Promise<void> {
    this.status = "connected";
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan("User > "),
    });

    console.log(chalk.bold.hex("#CC785C")(`\n --- HIRU CLI CHAT MODE --- `));
    console.log(chalk.gray(` Type your message and press Enter\n`));

    this.rl.prompt();

    this.rl.on("line", (line) => {
      const text = line.trim();
      if (!text) {
        this.rl?.prompt();
        return;
      }

      const inbound: InboundMessage = {
        id: Date.now().toString(),
        channelId: this.id,
        channelType: this.type,
        peerId: "cli-user",
        peerName: "CLI User",
        content: text,
        contentType: "text",
        timestamp: Date.now(),
        mentions: [],
        metadata: {},
      };

      this.emit("message", inbound);
    });
  }

  public async disconnect(): Promise<void> {
    this.rl?.close();
    this.status = "disconnected";
  }

  public async send(peerId: string, message: OutboundMessage): Promise<void> {
    console.log(`\n${chalk.hex("#CC785C").bold("Hiru >")} ${message.content}\n`);
    this.rl?.prompt();
  }

  public isConnected(): boolean {
    return this.status === "connected";
  }

  public getStatus(): ChannelStatus {
    return this.status;
  }
}
