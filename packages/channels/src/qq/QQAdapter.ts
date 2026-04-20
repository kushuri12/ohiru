import { EventEmitter } from "events";
import axios from "axios";
import crypto from "crypto";
import { ChannelAdapter } from "../shared/ChannelAdapter.js";
import { InboundMessage } from "../shared/InboundMessage.js";
import { OutboundMessage } from "../shared/OutboundMessage.js";
import { ChannelStatus, ChannelType } from "../shared/types.js";
import chalk from "chalk";

export class QQAdapter extends EventEmitter implements ChannelAdapter {
  public id: string;
  public type: ChannelType = "qq";
  private status: ChannelStatus = "disconnected";
  private appId: string;
  private appSecret: string;
  private token: string;
  private accessToken: string = "";

  constructor(id: string, appId: string, appSecret: string, token: string) {
    super();
    this.id = id;
    this.appId = appId;
    this.appSecret = appSecret;
    this.token = token;
  }

  public async connect(): Promise<void> {
    try {
      const response = await axios.post("https://api.q.qq.com/api/getToken", {
        grant_type: "client_credential",
        client_id: this.appId,
        client_secret: this.appSecret
      });
      this.accessToken = response.data.access_token;
      this.status = "connected";
      console.log(chalk.green(`[QQ] Connected as ${this.appId}`));
    } catch (err) {
      this.status = "error";
      console.error(chalk.red(`[QQ] Failed to connect: ${err}`));
    }
  }

  public async disconnect(): Promise<void> {
    this.status = "disconnected";
  }

  public async send(peerId: string, message: OutboundMessage): Promise<void> {
    await axios.post("https://api.q.qq.com/api/sendMessage", {
      receiver_openid: peerId,
      msg_type: 1,
      content: message.content
    }, {
      params: { access_token: this.accessToken }
    });
  }

  public isConnected(): boolean {
    return this.status === "connected";
  }

  public getStatus(): ChannelStatus {
    return this.status;
  }

  public async handleWebhook(body: any): Promise<void> {
    if (body.message && body.message.content) {
      const inbound: InboundMessage = {
        id: body.message.id || Date.now().toString(),
        channelId: this.id,
        channelType: this.type,
        peerId: body.sender.openid,
        peerName: body.sender.nickname || "QQ User",
        content: body.message.content,
        contentType: "text",
        timestamp: body.timestamp * 1000 || Date.now(),
        mentions: [],
        metadata: { ...body },
      };
      this.emit("message", inbound);
    }
  }
}