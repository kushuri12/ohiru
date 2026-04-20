import { EventEmitter } from "events";
import axios from "axios";
import { ChannelAdapter } from "../shared/ChannelAdapter.js";
import { InboundMessage } from "../shared/InboundMessage.js";
import { OutboundMessage } from "../shared/OutboundMessage.js";
import { ChannelStatus, ChannelType } from "../shared/types.js";
import chalk from "chalk";

export class MicrosoftTeamsAdapter extends EventEmitter implements ChannelAdapter {
  public id: string;
  public type: ChannelType = "teams";
  private status: ChannelStatus = "disconnected";
  private botId: string;
  private tenantId: string;
  private serviceUrl: string;
  private accessToken: string;

  constructor(id: string, botId: string, tenantId: string, serviceUrl: string, accessToken: string) {
    super();
    this.id = id;
    this.botId = botId;
    this.tenantId = tenantId;
    this.serviceUrl = serviceUrl;
    this.accessToken = accessToken;
  }

  public async connect(): Promise<void> {
    try {
      const response = await axios.get(`${this.serviceUrl}/v3/conversations`, {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      });
      this.status = "connected";
      console.log(chalk.green(`[Microsoft Teams] Connected: ${this.botId}`));
    } catch (err) {
      this.status = "error";
      console.error(chalk.red(`[Microsoft Teams] Failed to connect: ${err}`));
    }
  }

  public async disconnect(): Promise<void> {
    this.status = "disconnected";
  }

  public async send(peerId: string, message: OutboundMessage): Promise<void> {
    await axios.post(`${this.serviceUrl}/v3/conversations/${peerId}/activities`, {
      type: "message",
      text: message.content,
      from: { id: this.botId },
      recipient: { id: peerId }
    }, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
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

  public async handleActivity(activity: any): Promise<void> {
    if (activity.type === "message" && activity.text) {
      const inbound: InboundMessage = {
        id: activity.id || Date.now().toString(),
        channelId: this.id,
        channelType: this.type,
        peerId: activity.from?.id || "unknown",
        peerName: activity.from?.name || "Teams User",
        content: activity.text,
        contentType: "text",
        timestamp: activity.timestamp || Date.now(),
        mentions: [],
        metadata: { ...activity },
      };
      this.emit("message", inbound);
    }
  }
}