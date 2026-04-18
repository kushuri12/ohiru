import { ChannelAdapter } from "../shared/ChannelAdapter.js";
import { InboundMessage } from "../shared/InboundMessage.js";
import { OutboundMessage } from "../shared/OutboundMessage.js";
import { ChannelStatus, ChannelType } from "../shared/types.js";
import { EventEmitter } from "events";
import { WebChatServer } from "./WebChatServer.js";

export class WebChatAdapter extends EventEmitter implements ChannelAdapter {
  public id: string;
  public type: ChannelType = "webchat";
  private server: WebChatServer;
  private status: ChannelStatus = "disconnected";

  constructor(id: string, port: number) {
    super();
    this.id = id;
    this.server = new WebChatServer(port, id);
    this.server.on("message", (msg) => this.emit("message", msg));
  }

  public async connect(): Promise<void> {
    await this.server.start();
    this.status = "connected";
  }

  public async disconnect(): Promise<void> {
    await this.server.stop();
    this.status = "disconnected";
  }

  public async send(peerId: string, message: OutboundMessage): Promise<void> {
    this.server.sendToClient(peerId, message);
  }

  public isConnected(): boolean {
    return this.status === "connected";
  }

  public getStatus(): ChannelStatus {
    return this.status;
  }
}
