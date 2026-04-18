import { ChannelAdapter } from "../shared/ChannelAdapter.js";
import { InboundMessage } from "../shared/InboundMessage.js";
import { OutboundMessage } from "../shared/OutboundMessage.js";
import { ChannelStatus, ChannelType } from "../shared/types.js";
import { EventEmitter } from "events";
import chalk from "chalk";

export class NtfyAdapter extends EventEmitter implements ChannelAdapter {
  public id: string;
  public type: ChannelType = "ntfy";
  private status: ChannelStatus = "disconnected";
  private topic: string;
  private server: string;
  private abortController: AbortController | null = null;

  constructor(id: string, topic: string, server: string = "https://ntfy.sh") {
    super();
    this.id = id;
    this.topic = topic;
    this.server = server.endsWith("/") ? server.slice(0, -1) : server;
  }

  public async connect(): Promise<void> {
    this.status = "connected";
    console.log(chalk.green(`[Ntfy] Listening on ${this.server}/${this.topic}`));
    this.startListening();
  }

  private async startListening() {
    this.abortController = new AbortController();
    try {
      const response = await fetch(`${this.server}/${this.topic}/json`, {
        signal: this.abortController.signal,
      });

      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.event === "message") {
              const inbound: InboundMessage = {
                id: data.id,
                channelId: this.id,
                channelType: this.type,
                peerId: "ntfy-user", // ntfy is usually anonymous
                peerName: "Ntfy User",
                content: data.message,
                contentType: "text",
                timestamp: Date.now(),
                mentions: [],
                metadata: { ...data },
              };
              this.emit("message", inbound);
            }
          } catch (e) {}
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        this.status = "error";
        console.error(chalk.red(`[Ntfy] Listener error: ${err.message}`));
      }
    }
  }

  public async disconnect(): Promise<void> {
    if (this.abortController) this.abortController.abort();
    this.status = "disconnected";
  }

  public async send(peerId: string, message: OutboundMessage): Promise<void> {
    // We publish back to the same topic or a specific topic if peerId is a topic
    const target = peerId === "ntfy-user" ? this.topic : peerId;
    await fetch(`${this.server}/${target}`, {
      method: "POST",
      body: message.content,
      headers: {
        "Title": "Hiru Response",
        "Priority": "3"
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
