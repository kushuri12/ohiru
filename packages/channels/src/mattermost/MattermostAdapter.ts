import { EventEmitter } from "events";
import axios from "axios";
import { ChannelAdapter } from "../shared/ChannelAdapter.js";
import { InboundMessage } from "../shared/InboundMessage.js";
import { OutboundMessage } from "../shared/OutboundMessage.js";
import { ChannelStatus, ChannelType } from "../shared/types.js";
import chalk from "chalk";

export class MattermostAdapter extends EventEmitter implements ChannelAdapter {
  public id: string;
  public type: ChannelType = "mattermost";
  private status: ChannelStatus = "disconnected";
  private serverUrl: string;
  private botToken: string;
  private teamId: string;

  constructor(id: string, serverUrl: string, botToken: string, teamId: string) {
    super();
    this.id = id;
    this.serverUrl = serverUrl;
    this.botToken = botToken;
    this.teamId = teamId;
  }

  public async connect(): Promise<void> {
    try {
      const response = await axios.get(`${this.serverUrl}/api/v4/users/me`, {
        headers: { Authorization: `Bearer ${this.botToken}` }
      });
      this.status = "connected";
      console.log(chalk.green(`[Mattermost] Connected as ${response.data.username}`));
      this.startWebhook();
    } catch (err) {
      this.status = "error";
      console.error(chalk.red(`[Mattermost] Failed to connect: ${err}`));
    }
  }

  private startWebhook(): void {
    console.log(chalk.cyan(`[Mattermost] Webhook endpoint ready at /webhook/${this.id}`));
  }

  public async disconnect(): Promise<void> {
    this.status = "disconnected";
  }

  public async send(peerId: string, message: OutboundMessage): Promise<void> {
    await axios.post(`${this.serverUrl}/api/v4/posts`, {
      channel_id: peerId,
      message: message.content
    }, {
      headers: { Authorization: `Bearer ${this.botToken}` }
    });
  }

  public isConnected(): boolean {
    return this.status === "connected";
  }

  public getStatus(): ChannelStatus {
    return this.status;
  }

  public async handleWebhook(payload: any): Promise<void> {
    if (payload.type === "message" && payload.data?.post?.message) {
      const inbound: InboundMessage = {
        id: payload.data.post.id,
        channelId: this.id,
        channelType: this.type,
        peerId: payload.data.channel_id,
        peerName: payload.data.sender_name || "Mattermost User",
        content: payload.data.post.message,
        contentType: "text",
        timestamp: Date.now(),
        mentions: [],
        metadata: { ...payload },
      };
      this.emit("message", inbound);
    }
  }
}