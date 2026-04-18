import pkg from "matrix-js-sdk";
const { createClient } = pkg;
import { ChannelAdapter } from "../shared/ChannelAdapter.js";
import { InboundMessage } from "../shared/InboundMessage.js";
import { OutboundMessage } from "../shared/OutboundMessage.js";
import { ChannelStatus, ChannelType } from "../shared/types.js";
import { EventEmitter } from "events";
import chalk from "chalk";

export class MatrixAdapter extends EventEmitter implements ChannelAdapter {
  public id: string;
  public type: ChannelType = "matrix";
  private client: any;
  private status: ChannelStatus = "disconnected";
  private room: string;

  constructor(id: string, options: { homeserver: string; userId: string; accessToken: string; room: string }) {
    super();
    this.id = id;
    this.room = options.room;
    this.client = createClient({
      baseUrl: options.homeserver,
      accessToken: options.accessToken,
      userId: options.userId,
    });

    this.setupEvents();
  }

  private setupEvents() {
    this.client.on("Room.timeline", (event: any, room: any, atStart: boolean) => {
      if (atStart) return;
      if (event.getType() !== "m.room.message") return;
      if (event.getRoomId() !== this.room) return;
      if (event.getSender() === this.client.getUserId()) return;

      const inbound: InboundMessage = {
        id: event.getId(),
        channelId: this.id,
        channelType: this.type,
        peerId: event.getSender(),
        peerName: event.getSender(),
        content: event.getContent().body,
        contentType: "text",
        timestamp: Date.now(),
        mentions: [],
        metadata: { roomId: event.getRoomId() },
      };

      this.emit("message", inbound);
    });
  }

  public async connect(): Promise<void> {
    this.status = "reconnecting";
    await this.client.startClient({ initialSyncLimit: 1 });
    this.status = "connected";
    console.log(chalk.green(`[Matrix] Adapter connected to ${this.room}`));
  }

  public async disconnect(): Promise<void> {
    await this.client.stopClient();
    this.status = "disconnected";
  }

  public async send(peerId: string, message: OutboundMessage): Promise<void> {
    // Note: peerId might be used for DMs, but for now we send to the configured room
    await this.client.sendEvent(this.room, "m.room.message", {
      body: message.content,
      msgtype: "m.text",
    }, "");
  }

  public isConnected(): boolean {
    return this.status === "connected";
  }

  public getStatus(): ChannelStatus {
    return this.status;
  }
}
