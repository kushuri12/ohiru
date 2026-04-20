import { EventEmitter } from "events";
import axios from "axios";
import { ChannelAdapter } from "../shared/ChannelAdapter.js";
import { InboundMessage } from "../shared/InboundMessage.js";
import { OutboundMessage } from "../shared/OutboundMessage.js";
import { ChannelStatus, ChannelType } from "../shared/types.js";
import crypto from "crypto";
import chalk from "chalk";

export class FeishuAdapter extends EventEmitter implements ChannelAdapter {
  public id: string;
  public type: ChannelType = "feishu";
  private status: ChannelStatus = "disconnected";
  private appId: string;
  private appSecret: string;
  private encryptKey: string;
  private verificationToken: string;
  private accessToken: string = "";

  constructor(id: string, appId: string, appSecret: string, encryptKey: string, verificationToken: string) {
    super();
    this.id = id;
    this.appId = appId;
    this.appSecret = appSecret;
    this.encryptKey = encryptKey;
    this.verificationToken = verificationToken;
  }

  public async connect(): Promise<void> {
    try {
      const response = await axios.post("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
        app_id: this.appId,
        app_secret: this.appSecret
      });
      this.accessToken = response.data.access_token;
      this.status = "connected";
      console.log(chalk.green(`[Feishu] Connected as ${this.appId}`));
    } catch (err) {
      this.status = "error";
      console.error(chalk.red(`[Feishu] Failed to connect: ${err}`));
    }
  }

  public async disconnect(): Promise<void> {
    this.status = "disconnected";
  }

  public async send(peerId: string, message: OutboundMessage): Promise<void> {
    await axios.post("https://open.feishu.cn/open-apis/im/v1/messages", {
      receive_id_type: "user_id",
      receive_id: peerId,
      msg_type: "text",
      content: JSON.stringify({ text: message.content })
    }, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });
  }

  public isConnected(): boolean {
    return this.status === "connected";
  }

  public getStatus(): ChannelStatus {
    return this.status;
  }

  public async handleWebhook(body: any, headers: any): Promise<void> {
    const verifyToken = headers["x-lark-verification-token"];
    if (verifyToken !== this.verificationToken) return;

    if (body.event && body.event.message && body.event.message.message_type === "text") {
      const inbound: InboundMessage = {
        id: body.event.message.message_id,
        channelId: this.id,
        channelType: this.type,
        peerId: body.event.sender.sender_id.user_id,
        peerName: body.event.sender.sender_id.user_id,
        content: body.event.message.text,
        contentType: "text",
        timestamp: Date.now(),
        mentions: [],
        metadata: { ...body },
      };
      this.emit("message", inbound);
    }
  }
}