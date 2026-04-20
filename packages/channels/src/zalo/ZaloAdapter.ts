import { EventEmitter } from "events";
import axios from "axios";
import { ChannelAdapter } from "../shared/ChannelAdapter.js";
import { InboundMessage } from "../shared/InboundMessage.js";
import { OutboundMessage } from "../shared/OutboundMessage.js";
import { ChannelStatus, ChannelType } from "../shared/types.js";
import chalk from "chalk";

export class ZaloAdapter extends EventEmitter implements ChannelAdapter {
  public id: string;
  public type: ChannelType = "zalo";
  private status: ChannelStatus = "disconnected";
  private appId: string;
  private appSecret: string;
  private oaId: string;
  private accessToken!: string;

  constructor(id: string, appId: string, appSecret: string, oaId: string) {
    super();
    this.id = id;
    this.appId = appId;
    this.appSecret = appSecret;
    this.oaId = oaId;
  }

  public async connect(): Promise<void> {
    try {
      const response = await axios.post(`https://openapi.zalo.me/v1/oa/access_token`, {
        app_id: this.appId,
        app_secret: this.appSecret,
        grant_type: "client_credentials"
      });
      this.accessToken = response.data.access_token;
      this.status = "connected";
      console.log(chalk.green(`[Zalo] Connected as ${this.oaId}`));
    } catch (err) {
      this.status = "error";
      console.error(chalk.red(`[Zalo] Failed to connect: ${err}`));
    }
  }

  public async disconnect(): Promise<void> {
    this.status = "disconnected";
  }

  public async send(peerId: string, message: OutboundMessage): Promise<void> {
    await axios.post(`https://openapi.zalo.me/v1/oa/message/text`, {
      oa_id: this.oaId,
      recipient: { user_id: peerId },
      message: { text: message.content }
    }, {
      headers: { access_token: this.accessToken }
    });
  }

  public isConnected(): boolean {
    return this.status === "connected";
  }

  public getStatus(): ChannelStatus {
    return this.status;
  }

  public async handleWebhook(body: any): Promise<void> {
    if (body.message && body.message.text) {
      const inbound: InboundMessage = {
        id: body.message.mid || Date.now().toString(),
        channelId: this.id,
        channelType: this.type,
        peerId: body.sender.id,
        peerName: body.sender.name || "Zalo User",
        content: body.message.text,
        contentType: "text",
        timestamp: Date.now(),
        mentions: [],
        metadata: { ...body },
      };
      this.emit("message", inbound);
    }
  }
}