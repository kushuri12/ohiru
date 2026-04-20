import { EventEmitter } from "events";
import { Client as TwitchClient } from "tmi.js";
import { ChannelAdapter } from "../shared/ChannelAdapter.js";
import { InboundMessage } from "../shared/InboundMessage.js";
import { OutboundMessage } from "../shared/OutboundMessage.js";
import { ChannelStatus, ChannelType } from "../shared/types.js";
import chalk from "chalk";

export class TwitchAdapter extends EventEmitter implements ChannelAdapter {
  public id: string;
  public type: ChannelType = "twitch";
  private status: ChannelStatus = "disconnected";
  private client!: TwitchClient;
  private channels: string[];
  private username: string;
  private password: string;

  constructor(id: string, username: string, password: string, channels: string[]) {
    super();
    this.id = id;
    this.username = username;
    this.password = password;
    this.channels = channels;
  }

  public async connect(): Promise<void> {
    try {
      this.client = new (TwitchClient as any)({
        options: { debug: true },
        identity: {
          username: this.username,
          password: this.password
        },
        channels: this.channels
      });

      this.client.on("message", (channel: string, tags: any, message: string, self: boolean) => {
        if (self) return;
        
        const inbound: InboundMessage = {
          id: `${tags.id}`,
          channelId: this.id,
          channelType: this.type,
          peerId: tags["user-id"],
          peerName: tags.username,
          content: message,
          contentType: "text",
          timestamp: Date.now(),
          mentions: [],
          metadata: { tags, channel },
        };
        this.emit("message", inbound);
      });

      this.client.connect();
      this.status = "connected";
      console.log(chalk.green(`[Twitch] Connected to ${this.channels.join(", ")}`));
    } catch (err) {
      this.status = "error";
      console.error(chalk.red(`[Twitch] Failed to connect: ${err}`));
    }
  }

  public async disconnect(): Promise<void> {
    this.client?.disconnect();
    this.status = "disconnected";
  }

  public async send(peerId: string, message: OutboundMessage): Promise<void> {
    this.client?.say(peerId, message.content);
  }

  public isConnected(): boolean {
    return this.status === "connected";
  }

  public getStatus(): ChannelStatus {
    return this.status;
  }
}