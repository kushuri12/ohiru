import { EventEmitter } from "events";
import { ChannelAdapter } from "./shared/ChannelAdapter.js";
import { InboundMessage } from "./shared/InboundMessage.js";
import { OutboundMessage } from "./shared/OutboundMessage.js";
import { DiscordAdapter } from "./discord/DiscordAdapter.js";
import { SlackAdapter } from "./slack/SlackAdapter.js";
import { WhatsAppAdapter } from "./whatsapp/WhatsAppAdapter.js";
import { SignalAdapter } from "./signal/SignalAdapter.js";
import { MatrixAdapter } from "./matrix/MatrixAdapter.js";
import { IrcAdapter } from "./irc/IrcAdapter.js";
import { WebChatAdapter } from "./webchat/WebChatAdapter.js";
import { NtfyAdapter } from "./ntfy/NtfyAdapter.js";
import { EmailAdapter } from "./email/EmailAdapter.js";
import { CliChatAdapter } from "./cli-chat/CliChatAdapter.js";
import { DiscordWebhookAdapter } from "./discord/webhook/DiscordWebhookAdapter.js";
import chalk from "chalk";

export class ChannelManager extends EventEmitter {
  private adapters = new Map<string, ChannelAdapter>();

  public addAdapter(adapter: ChannelAdapter) {
    this.adapters.set(adapter.id, adapter);
    adapter.on("message", (msg) => this.emit("message", msg));
  }

  public async startAll() {
    console.log(chalk.cyan(`[Channels] Starting all adapters...`));
    for (const adapter of this.adapters.values()) {
      try {
        await adapter.connect();
      } catch (err) {
        console.error(chalk.red(`[Channels] Failed to start ${adapter.id}:`), err);
      }
    }
  }

  public async stopAll() {
    for (const adapter of this.adapters.values()) {
      await adapter.disconnect();
    }
  }

  public getAdapter(id: string): ChannelAdapter | undefined {
    return this.adapters.get(id);
  }

  public async send(channelId: string, peerId: string, message: OutboundMessage) {
    const adapter = this.getAdapter(channelId);
    if (!adapter) throw new Error(`Channel ${channelId} not found`);
    await adapter.send(peerId, message);
  }

  public getStatus() {
    const status: Record<string, string> = {};
    for (const [id, adapter] of this.adapters) {
      status[id] = adapter.getStatus();
    }
    return status;
  }
}
