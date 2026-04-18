import pkg from "@slack/bolt";
const { App } = pkg;
import { ChannelAdapter } from "../shared/ChannelAdapter.js";
import { InboundMessage } from "../shared/InboundMessage.js";
import { OutboundMessage } from "../shared/OutboundMessage.js";
import { ChannelStatus, ChannelType } from "../shared/types.js";
import { EventEmitter } from "events";
import chalk from "chalk";

export class SlackAdapter extends EventEmitter implements ChannelAdapter {
  public id: string;
  public type: ChannelType = "slack";
  private app: any;
  private status: ChannelStatus = "disconnected";

  constructor(id: string, options: { token: string; signingSecret: string; appToken: string }) {
    super();
    this.id = id;
    this.app = new App({
      token: options.token,
      signingSecret: options.signingSecret,
      socketMode: true,
      appToken: options.appToken,
    });

    this.setupEvents();
  }

  private setupEvents() {
    this.app.message(async ({ message, say }: any) => {
      if (message.subtype) return;

      const inbound: InboundMessage = {
        id: message.ts,
        channelId: this.id,
        channelType: this.type,
        peerId: message.user,
        peerName: message.user, // Fetch real name in a full impl
        content: message.text || "",
        contentType: "text",
        timestamp: parseFloat(message.ts) * 1000,
        mentions: (message.text.match(/<@[A-Z0-9]+>/g) || []).map((m: string) => m.slice(2, -1)),
        metadata: {
          channel: message.channel,
          thread_ts: message.thread_ts,
        },
      };

      this.emit("message", inbound);
    });
  }

  public async connect(): Promise<void> {
    this.status = "reconnecting";
    await this.app.start();
    this.status = "connected";
    console.log(chalk.green(`[Slack] Adapter connected`));
  }

  public async disconnect(): Promise<void> {
    await this.app.stop();
    this.status = "disconnected";
  }

  public async send(peerId: string, message: OutboundMessage): Promise<void> {
    await this.app.client.chat.postMessage({
      channel: peerId, // Could be user DM or channel ID
      text: message.content,
    });
  }

  public isConnected(): boolean {
    return this.status === "connected";
  }

  public getStatus(): ChannelStatus {
    return this.status;
  }
}
