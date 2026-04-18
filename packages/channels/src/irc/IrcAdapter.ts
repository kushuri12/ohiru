import irc from "irc";
import { ChannelAdapter } from "../shared/ChannelAdapter.js";
import { InboundMessage } from "../shared/InboundMessage.js";
import { OutboundMessage } from "../shared/OutboundMessage.js";
import { ChannelStatus, ChannelType } from "../shared/types.js";
import { EventEmitter } from "events";
import chalk from "chalk";

export class IrcAdapter extends EventEmitter implements ChannelAdapter {
  public id: string;
  public type: ChannelType = "irc";
  private client: any;
  private status: ChannelStatus = "disconnected";
  private channel: string;

  constructor(id: string, options: { server: string; port: number; nick: string; channel: string; tls?: boolean }) {
    super();
    this.id = id;
    this.channel = options.channel;
    this.client = new irc.Client(options.server, options.nick, {
      channels: [options.channel],
      port: options.port,
      secure: options.tls,
      autoConnect: false,
    });

    this.setupEvents();
  }

  private setupEvents() {
    this.client.addListener("message", (from: string, to: string, message: string) => {
      // 'to' is either the channel or the bot's nick (for private messages)
      const inbound: InboundMessage = {
        id: Date.now().toString(), // IRC doesn't provide stability in message IDs
        channelId: this.id,
        channelType: this.type,
        peerId: from,
        peerName: from,
        content: message,
        contentType: "text",
        timestamp: Date.now(),
        mentions: [],
        metadata: { from, to, message },
      };

      this.emit("message", inbound);
    });

    this.client.addListener("error", (err: any) => {
      this.status = "error";
      console.error(chalk.red(`[IRC] Error: ${err.reason || err.command}`));
    });

    this.client.addListener("registered", () => {
      this.status = "connected";
      console.log(chalk.green(`[IRC] Registered and connected to ${this.channel}`));
    });
  }

  public async connect(): Promise<void> {
    this.status = "reconnecting";
    this.client.connect();
  }

  public async disconnect(): Promise<void> {
    this.client.disconnect();
    this.status = "disconnected";
  }

  public async send(peerId: string, message: OutboundMessage): Promise<void> {
    // peerId is either nick or channel
    this.client.say(peerId, message.content);
  }

  public isConnected(): boolean {
    return this.status === "connected";
  }

  public getStatus(): ChannelStatus {
    return this.status;
  }
}
