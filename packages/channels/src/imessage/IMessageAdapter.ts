import { EventEmitter } from "events";
import axios from "axios";
import { ChannelAdapter } from "../shared/ChannelAdapter.js";
import { InboundMessage } from "../shared/InboundMessage.js";
import { OutboundMessage } from "../shared/OutboundMessage.js";
import { ChannelStatus, ChannelType } from "../shared/types.js";
import chalk from "chalk";

export class IMessageAdapter extends EventEmitter implements ChannelAdapter {
  public id: string;
  public type: ChannelType = "imessage";
  private status: ChannelStatus = "disconnected";
  private serverUrl: string;
  private apiPassword: string;
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(id: string, serverUrl: string, apiPassword: string) {
    super();
    this.id = id;
    this.serverUrl = serverUrl;
    this.apiPassword = apiPassword;
  }

  public async connect(): Promise<void> {
    try {
      const response = await axios.get(`${this.serverUrl}/api/ping`, {
        headers: { "api-password": this.apiPassword }
      });
      this.status = "connected";
      console.log(chalk.green(`[iMessage] Connected to BlueBubbles server`));
      this.startPolling();
    } catch (err) {
      this.status = "error";
      console.error(chalk.red(`[iMessage] Failed to connect: ${err}`));
    }
  }

  private startPolling(): void {
    this.refreshTimer = setInterval(async () => {
      try {
        const response = await axios.get(`${this.serverUrl}/api/messages/recent`, {
          headers: { "api-password": this.apiPassword },
          params: { limit: 10 }
        });
        for (const msg of response.data.messages || []) {
          if (!msg.isFromMe) {
            const inbound: InboundMessage = {
              id: msg.guid,
              channelId: this.id,
              channelType: this.type,
              peerId: msg.handle,
              peerName: msg.handle,
              content: msg.text,
              contentType: "text",
              timestamp: new Date(msg.date).getTime(),
              mentions: [],
              metadata: { ...msg },
            };
            this.emit("message", inbound);
          }
        }
      } catch (e) {}
    }, 5000);
  }

  public async disconnect(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.status = "disconnected";
  }

  public async send(peerId: string, message: OutboundMessage): Promise<void> {
    await axios.post(`${this.serverUrl}/api/messages/send`, {
      address: peerId,
      message: message.content
    }, {
      headers: { 
        "api-password": this.apiPassword,
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
}