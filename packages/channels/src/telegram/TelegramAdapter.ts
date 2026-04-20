import { EventEmitter } from "events";
import { ChannelAdapter } from "../shared/ChannelAdapter.js";
import { InboundMessage } from "../shared/InboundMessage.js";
import { OutboundMessage } from "../shared/OutboundMessage.js";
import { ChannelStatus, ChannelType } from "../shared/types.js";
import chalk from "chalk";

const Grammy = require("grammy");

export class TelegramAdapter extends EventEmitter implements ChannelAdapter {
  public id: string;
  public type: ChannelType = "telegram";
  private status: ChannelStatus = "disconnected";
  private bot: any;
  private botToken: string;

  constructor(id: string, botToken: string) {
    super();
    this.id = id;
    this.botToken = botToken;
  }

  public async connect(): Promise<void> {
    try {
      this.bot = new Grammy(this.botToken);
      
      this.bot.on("message:text", async (ctx: any) => {
        const text = ctx.message.text;
        if (text.startsWith("/")) return;
        
        const inbound: InboundMessage = {
          id: ctx.message.message_id.toString(),
          channelId: this.id,
          channelType: this.type,
          peerId: ctx.from.id.toString(),
          peerName: ctx.from.first_name || ctx.from.username || "Telegram User",
          content: text,
          contentType: "text",
          timestamp: ctx.message.date * 1000,
          mentions: [],
          metadata: { chat: ctx.chat, from: ctx.from },
        };
        this.emit("message", inbound);
      });

      await this.bot.start();
      this.status = "connected";
      console.log(chalk.green(`[Telegram] Bot started`));
    } catch (err) {
      this.status = "error";
      console.error(chalk.red(`[Telegram] Failed to connect: ${err}`));
    }
  }

  public async disconnect(): Promise<void> {
    await this.bot.stop();
    this.status = "disconnected";
  }

  public async send(peerId: string, message: OutboundMessage): Promise<void> {
    const chatId = parseInt(peerId);
    await this.bot.api.sendMessage(chatId, message.content);
  }

  public isConnected(): boolean {
    return this.status === "connected";
  }

  public getStatus(): ChannelStatus {
    return this.status;
  }
}