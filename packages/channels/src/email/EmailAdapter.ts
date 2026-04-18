import Imap from "node-imap";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { ChannelAdapter } from "../shared/ChannelAdapter.js";
import { InboundMessage } from "../shared/InboundMessage.js";
import { OutboundMessage } from "../shared/OutboundMessage.js";
import { ChannelStatus, ChannelType } from "../shared/types.js";
import { EventEmitter } from "events";
import chalk from "chalk";

export class EmailAdapter extends EventEmitter implements ChannelAdapter {
  public id: string;
  public type: ChannelType = "email";
  private imap: any;
  private transporter: any;
  private status: ChannelStatus = "disconnected";
  private config: any;

  constructor(id: string, config: { imap: any; smtp: any }) {
    super();
    this.id = id;
    this.config = config;
    
    this.imap = new Imap(config.imap);
    this.transporter = nodemailer.createTransport(config.smtp);
    
    this.setupEvents();
  }

  private setupEvents() {
    this.imap.on("ready", () => {
      this.status = "connected";
      console.log(chalk.green(`[Email] IMAP ready`));
      this.openInbox();
    });

    this.imap.on("error", (err: any) => {
      this.status = "error";
      console.error(chalk.red(`[Email] IMAP error: ${err.message}`));
    });

    this.imap.on("mail", (numNewMsgs: number) => {
      this.fetchNewMessages();
    });
  }

  private openInbox() {
    this.imap.openBox("INBOX", false, (err: any) => {
      if (err) console.error(err);
    });
  }

  private fetchNewMessages() {
    this.imap.search(["UNSEEN"], (err: any, results: any) => {
      if (err || !results.length) return;
      const f = this.imap.fetch(results, { bodies: "" });
      f.on("message", (msg: any) => {
        msg.on("body", (stream: any) => {
          simpleParser(stream, async (err, parsed) => {
            if (err) return;
            const inbound: InboundMessage = {
              id: parsed.messageId || Date.now().toString(),
              channelId: this.id,
              channelType: this.type,
              peerId: parsed.from?.value[0]?.address || "unknown",
              peerName: parsed.from?.value[0]?.name || "Email User",
              content: parsed.text || "",
              contentType: "text",
              timestamp: Date.now(),
              mentions: [],
              metadata: { subject: parsed.subject, ...parsed.from },
            };
            this.emit("message", inbound);
          });
        });
      });
    });
  }

  public async connect(): Promise<void> {
    this.status = "reconnecting";
    this.imap.connect();
  }

  public async disconnect(): Promise<void> {
    this.imap.end();
    this.status = "disconnected";
  }

  public async send(peerId: string, message: OutboundMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.smtp.auth.user,
      to: peerId,
      subject: `Hiru Reply: ${message.content.slice(0, 30)}...`,
      text: message.content,
    });
  }

  public isConnected(): boolean {
    return this.status === "connected";
  }

  public getStatus(): ChannelStatus {
    return this.status;
  }
}
