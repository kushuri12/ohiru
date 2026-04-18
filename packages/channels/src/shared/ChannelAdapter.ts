import { InboundMessage } from "./InboundMessage.js";
import { OutboundMessage } from "./OutboundMessage.js";
import { ChannelStatus, ChannelType } from "./types.js";

export interface ChannelAdapter {
  id: string;
  type: ChannelType;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(peerId: string, message: OutboundMessage): Promise<void>;
  on(event: "message", handler: (msg: InboundMessage) => void): void;
  isConnected(): boolean;
  getStatus(): ChannelStatus;
}
