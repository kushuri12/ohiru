import express from "express";
import { createServer, Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { EventEmitter } from "events";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import chalk from "chalk";
import { InboundMessage } from "../shared/InboundMessage.js";
import { OutboundMessage } from "../shared/OutboundMessage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class WebChatServer extends EventEmitter {
  private app = express();
  private httpServer: Server;
  private wss: WebSocketServer;
  private port: number;
  private connections = new Map<string, WebSocket>();
  private adapterId: string;

  constructor(port: number, adapterId: string) {
    super();
    this.port = port;
    this.adapterId = adapterId;
    this.httpServer = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupRoutes() {
    this.app.get("/", (req, res) => {
      const htmlPath = path.join(__dirname, "ui", "WebChatApp.html");
      res.sendFile(htmlPath);
    });

    this.app.get("/widget.js", (req, res) => {
        // Serve a script that embeds an iframe
        res.setHeader('Content-Type', 'application/javascript');
        res.send(`
          (function() {
            var iframe = document.createElement('iframe');
            iframe.src = 'http://localhost:${this.port}/';
            iframe.style.position = 'fixed';
            iframe.style.bottom = '20px';
            iframe.style.right = '20px';
            iframe.style.width = '400px';
            iframe.style.height = '600px';
            iframe.style.border = 'none';
            iframe.style.borderRadius = '12px';
            iframe.style.boxShadow = '0 8px 32px rgba(0,0,0,0.2)';
            iframe.style.zIndex = '9999';
            document.body.appendChild(iframe);
          })();
        `);
    });
  }

  private setupWebSocket() {
    this.wss.on("connection", (ws: WebSocket) => {
      const clientId = Math.random().toString(36).substring(7);
      this.connections.set(clientId, ws);

      ws.on("message", (data) => {
        try {
          const payload = JSON.parse(data.toString());
          const inbound: InboundMessage = {
            id: Date.now().toString(),
            channelId: this.adapterId,
            channelType: "webchat",
            peerId: clientId,
            peerName: "Web User",
            content: payload.text,
            contentType: "text",
            timestamp: Date.now(),
            mentions: [],
            metadata: {},
          };
          this.emit("message", inbound);
        } catch (e) {}
      });

      ws.on("close", () => this.connections.delete(clientId));
    });
  }

  public sendToClient(clientId: string, message: OutboundMessage) {
    const ws = this.connections.get(clientId);
    if (ws) {
      ws.send(JSON.stringify(message));
    }
  }

  public async start() {
    return new Promise<void>((resolve) => {
      this.httpServer.listen(this.port, () => {
        console.log(chalk.green(`[WebChat] Server listening on http://localhost:${this.port}`));
        resolve();
      });
    });
  }

  public async stop() {
    this.wss.close();
    this.httpServer.close();
  }
}
