import { EventEmitter } from "events";
import { ChannelAdapter } from "../shared/ChannelAdapter.js";
import { InboundMessage } from "../shared/InboundMessage.js";
import { OutboundMessage } from "../shared/OutboundMessage.js";
import { ChannelStatus, ChannelType } from "../shared/types.js";
import chalk from "chalk";

export class NostrAdapter extends EventEmitter implements ChannelAdapter {
  public id: string;
  public type: ChannelType = "nostr";
  private status: ChannelStatus = "disconnected";
  private relays: string[];
  private privateKey: string;
  private publicKey: string = "";
  private socket: WebSocket | null = null;

  constructor(id: string, relays: string[], privateKey: string) {
    super();
    this.id = id;
    this.relays = relays;
    this.privateKey = privateKey;
  }

  public async connect(): Promise<void> {
    try {
      this.publicKey = this.derivePublicKey(this.privateKey);
      for (const relay of this.relays) {
        const ws = new WebSocket(relay);
        ws.onopen = () => {
          this.sendSubscription(ws);
        };
        ws.onmessage = (event) => {
          this.handleMessage(JSON.parse(event.data));
        };
      }
      this.status = "connected";
      console.log(chalk.green(`[Nostr] Connected to ${this.relays.length} relays`));
    } catch (err) {
      this.status = "error";
      console.error(chalk.red(`[Nostr] Failed to connect: ${err}`));
    }
  }

  private derivePublicKey(privateKey: string): string {
    // Simplified - in production use noble-secp256k1
    return "npub" + Buffer.from(privateKey).toString("base64");
  }

  private sendSubscription(ws: WebSocket): void {
    const filter = { kinds: [1], limit: 100 };
    ws.send(JSON.stringify(["REQ", this.id, filter]));
  }

  private handleMessage(data: any): void {
    if (data[0] === "EVENT" && data[2]) {
      const event = data[2];
      const inbound: InboundMessage = {
        id: event.id,
        channelId: this.id,
        channelType: this.type,
        peerId: event.pubkey,
        peerName: event.pubkey.slice(0, 8),
        content: event.content,
        contentType: "text",
        timestamp: event.created_at * 1000,
        mentions: [],
        metadata: { ...event },
      };
      this.emit("message", inbound);
    }
  }

  public async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.close();
    }
    this.status = "disconnected";
  }

  public async send(peerId: string, message: OutboundMessage): Promise<void> {
    const event = {
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: peerId ? [["p", peerId]] : [],
      content: message.content,
      pubkey: this.publicKey,
    };
    for (const relay of this.relays) {
      const ws = new WebSocket(relay);
      ws.onopen = () => {
        ws.send(JSON.stringify(["EVENT", event]));
      };
    }
  }

  public isConnected(): boolean {
    return this.status === "connected";
  }

  public getStatus(): ChannelStatus {
    return this.status;
  }
}