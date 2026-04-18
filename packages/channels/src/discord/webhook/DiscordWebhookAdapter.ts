import fetch from "node-fetch";
import { ChannelAdapter } from "../../shared/ChannelAdapter.js";
import { InboundMessage } from "../../shared/InboundMessage.js";
import { OutboundMessage } from "../../shared/OutboundMessage.js";
import { ChannelStatus, ChannelType } from "../../shared/types.js";
import { EventEmitter } from "events";
import chalk from "chalk";

export class DiscordWebhookAdapter extends EventEmitter implements ChannelAdapter {
  public id: string;
  public type: ChannelType = "discord-webhook";
  private webhookUrl: string;
  private status: ChannelStatus = "disconnected";

  constructor(id: string, webhookUrl: string) {
    super();
    this.id = id;
    this.webhookUrl = webhookUrl;
  }

  public async connect(): Promise<void> {
    this.status = "connected";
    console.log(chalk.green(`[Discord Webhook] Adapter ready`));
  }

  public async disconnect(): Promise<void> {
    this.status = "disconnected";
  }

  public async send(peerId: string, message: OutboundMessage): Promise<void> {
    await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: message.content,
        username: "Hiru"
      }),
    });
  }

  public override on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  public isConnected(): boolean {
    return this.status === "connected";
  }

  public getStatus(): ChannelStatus {
    return this.status;
  }
}
