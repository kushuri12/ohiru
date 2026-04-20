import { EventEmitter } from "events";
import axios from "axios";
import crypto from "crypto";
import { ChannelAdapter } from "../shared/ChannelAdapter.js";
import { InboundMessage } from "../shared/InboundMessage.js";
import { OutboundMessage } from "../shared/OutboundMessage.js";
import { ChannelStatus, ChannelType } from "../shared/types.js";
import chalk from "chalk";

export class WeChatAdapter extends EventEmitter implements ChannelAdapter {
  public id: string;
  public type: ChannelType = "wechat";
  private status: ChannelStatus = "disconnected";
  private appId: string;
  private appSecret: string;
  private token: string;
  private encodingAesKey: string;
  private accessToken!: string;
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(id: string, appId: string, appSecret: string, token: string, encodingAesKey: string) {
    super();
    this.id = id;
    this.appId = appId;
    this.appSecret = appSecret;
    this.token = token;
    this.encodingAesKey = encodingAesKey;
  }

  public async connect(): Promise<void> {
    try {
      const response = await axios.get(`https://api.weixin.qq.com/cgi-bin/token`, {
        params: {
          grant_type: "client_credential",
          appid: this.appId,
          secret: this.appSecret
        }
      });
      this.accessToken = response.data.access_token;
      this.status = "connected";
      console.log(chalk.green(`[WeChat] Connected as ${this.appId}`));
      this.startRefreshToken();
    } catch (err) {
      this.status = "error";
      console.error(chalk.red(`[WeChat] Failed to connect: ${err}`));
    }
  }

  private startRefreshToken(): void {
    this.refreshTimer = setInterval(async () => {
      await this.connect();
    }, 7000 * 1000);
  }

  public async disconnect(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.status = "disconnected";
  }

  public async send(peerId: string, message: OutboundMessage): Promise<void> {
    await axios.post(`https://api.weixin.qq.com/cgi-bin/message/custom/send`, {
      touser: peerId,
      msgtype: "text",
      text: { content: message.content }
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

  public async handleWebhook(query: any, body: any): Promise<void> {
    const { msg_signature, timestamp, nonce, encrypt_msg } = body;
    
    if (body.msgtype === "text") {
      const inbound: InboundMessage = {
        id: `wechat_${Date.now()}`,
        channelId: this.id,
        channelType: this.type,
        peerId: body.fromUserName,
        peerName: body.fromUserName,
        content: body.content,
        contentType: "text",
        timestamp: Date.now(),
        mentions: [],
        metadata: { ...body },
      };
      this.emit("message", inbound);
    }
  }

  private verifySignature(signature: string, timestamp: string, nonce: string): boolean {
    const arr = [this.token, timestamp, nonce].sort();
    const str = arr.join("");
    const hash = crypto.createHash("sha1").update(str).digest("hex");
    return hash === signature;
  }
}