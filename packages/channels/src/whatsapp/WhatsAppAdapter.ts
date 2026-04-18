import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { ChannelAdapter } from "../shared/ChannelAdapter.js";
import { InboundMessage } from "../shared/InboundMessage.js";
import { OutboundMessage } from "../shared/OutboundMessage.js";
import { ChannelStatus, ChannelType } from "../shared/types.js";
import { EventEmitter } from "events";
import path from "path";
import os from "os";
import chalk from "chalk";

export class WhatsAppAdapter extends EventEmitter implements ChannelAdapter {
  public id: string;
  public type: ChannelType = "whatsapp";
  private sock: any;
  private status: ChannelStatus = "disconnected";
  private sessionDir: string;

  constructor(id: string, sessionDir?: string) {
    super();
    this.id = id;
    this.sessionDir = sessionDir || path.join(os.homedir(), ".hiru", "channels", "whatsapp", "session");
  }

  public async connect(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,
    });

    this.sock.ev.on("connection.update", (update: any) => {
      const { connection, lastDisconnect } = update;
      if (connection === "close") {
        const shouldReconnect = (lastDisconnect.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        this.status = "disconnected";
        if (shouldReconnect) this.connect();
      } else if (connection === "open") {
        this.status = "connected";
        console.log(chalk.green(`[WhatsApp] Connection opened`));
      }
    });

    this.sock.ev.on("creds.update", saveCreds);

    this.sock.ev.on("messages.upsert", async (m: any) => {
      if (m.type === "notify") {
        for (const msg of m.messages) {
          if (!msg.key.fromMe && msg.message) {
            const inbound: InboundMessage = {
              id: msg.key.id!,
              channelId: this.id,
              channelType: this.type,
              peerId: msg.key.remoteJid!,
              peerName: msg.pushName || "WhatsApp User",
              content: msg.message.conversation || msg.message.extendedTextMessage?.text || "",
              contentType: "text",
              timestamp: (msg.messageTimestamp as number) * 1000,
              mentions: msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [],
              metadata: { ...msg.key },
            };
            this.emit("message", inbound);
          }
        }
      }
    });
  }

  public async disconnect(): Promise<void> {
    await this.sock.logout();
    this.status = "disconnected";
  }

  public async send(peerId: string, message: OutboundMessage): Promise<void> {
    await this.sock.sendMessage(peerId, { text: message.content });
  }

  public isConnected(): boolean {
    return this.status === "connected";
  }

  public getStatus(): ChannelStatus {
    return this.status;
  }
}
