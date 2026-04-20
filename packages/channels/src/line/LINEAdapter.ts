import { EventEmitter } from "events";
import axios from "axios";
import { ChannelAdapter } from "../shared/ChannelAdapter.js";
import { InboundMessage } from "../shared/InboundMessage.js";
import { OutboundMessage } from "../shared/OutboundMessage.js";
import { ChannelStatus, ChannelType } from "../shared/types.js";
import chalk from "chalk";

export class LINEAdapter extends EventEmitter implements ChannelAdapter {
  public id: string;
  public type: ChannelType = "line";
  private status: ChannelStatus = "disconnected";
  private channelSecret: string;
  private channelAccessToken: string;
  private userId: string;

  constructor(id: string, channelSecret: string, channelAccessToken: string, userId: string) {
    super();
    this.id = id;
    this.channelSecret = channelSecret;
    this.channelAccessToken = channelAccessToken;
    this.userId = userId;
  }

  public async connect(): Promise<void> {
    try {
      const response = await axios.get("https://api.line.me/v2/bot/profile/" + this.userId, {
        headers: { Authorization: `Bearer ${this.channelAccessToken}` }
      });
      this.status = "connected";
      console.log(chalk.green(`[LINE] Connected as ${response.data.displayName}`));
    } catch (err) {
      this.status = "error";
      console.error(chalk.red(`[LINE] Failed to connect: ${err}`));
    }
  }

  public async disconnect(): Promise<void> {
    this.status = "disconnected";
  }

  public async send(peerId: string, message: OutboundMessage): Promise<void> {
    await axios.post("https://api.line.me/v2/bot/message/push", {
      to: peerId,
      messages: [{
        type: "text",
        text: message.content
      }]
    }, {
      headers: {
        Authorization: `Bearer ${this.channelAccessToken}`,
        "Content-Type": "application/json"
      }
    });
  }

  public isConnected(): boolean {
    return this.status === "connected";
  }

  public getStatus(): ChannelStatus {
    return this.status;
  }

  public async handleWebhook(body: any): Promise<void> {
    if (body.events && Array.isArray(body.events)) {
      for (const event of body.events) {
        if (event.type === "message" && event.message.type === "text") {
          const inbound: InboundMessage = {
            id: event.message.id,
            channelId: this.id,
            channelType: this.type,
            peerId: event.source.userId,
            peerName: event.source.userId,
            content: event.message.text,
            contentType: "text",
            timestamp: event.timestamp,
            mentions: [],
            metadata: { ...event },
          };
          this.emit("message", inbound);
        }
      }
    }
  }
}