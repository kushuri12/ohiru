import { Client, GatewayIntentBits, Partials, Message, TextChannel } from "discord.js";
import { ChannelAdapter } from "../shared/ChannelAdapter.js";
import { InboundMessage } from "../shared/InboundMessage.js";
import { OutboundMessage } from "../shared/OutboundMessage.js";
import { ChannelStatus, ChannelType } from "../shared/types.js";
import { EventEmitter } from "events";
import chalk from "chalk";

export class DiscordAdapter extends EventEmitter implements ChannelAdapter {
  public id: string;
  public type: ChannelType = "discord";
  private client: Client;
  private token: string;
  private status: ChannelStatus = "disconnected";

  constructor(id: string, token: string) {
    super();
    this.id = id;
    this.token = token;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel, Partials.Message],
    });

    this.setupEvents();
  }

  private setupEvents() {
    this.client.on("ready", () => {
      this.status = "connected";
      console.log(chalk.green(`[Discord] Logged in as ${this.client.user?.tag}`));
    });

    this.client.on("messageCreate", async (msg: Message) => {
      if (msg.author.bot) return;

      const inbound: InboundMessage = {
        id: msg.id,
        channelId: this.id,
        channelType: this.type,
        peerId: msg.author.id,
        peerName: msg.author.username,
        content: msg.content,
        contentType: "text", // Simplify for now
        timestamp: Date.now(),
        mentions: [],
        metadata: {
          guildId: msg.guildId,
          channelId: msg.channelId,
        },
      };

      this.emit("message", inbound);
    });

    this.client.on("error", (err) => {
      this.status = "error";
      console.error(chalk.red(`[Discord] Error: ${err.message}`));
    });
  }

  public async connect(): Promise<void> {
    this.status = "reconnecting";
    await this.client.login(this.token);
  }

  public async disconnect(): Promise<void> {
    this.client.destroy();
    this.status = "disconnected";
  }

  public async send(peerId: string, message: OutboundMessage): Promise<void> {
    const user = await this.client.users.fetch(peerId);
    if (!user) throw new Error(`User ${peerId} not found`);

    if (message.contentType === "text" || message.contentType === "markdown") {
      await user.send(message.content);
    }
    // Handle other types later
  }

  public isConnected(): boolean {
    return this.status === "connected";
  }

  public getStatus(): ChannelStatus {
    return this.status;
  }
}
