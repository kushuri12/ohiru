import express from "express";
import { createServer, Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";
import { CanvasState } from "./CanvasState.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class CanvasServer {
  private app = express();
  private httpServer: Server;
  private wss: WebSocketServer;
  private port: number;
  private state = new CanvasState();

  constructor(port: number) {
    this.port = port;
    this.httpServer = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupRoutes() {
    this.app.get("/", (req, res) => {
      res.sendFile(path.join(__dirname, "ui", "CanvasApp.html"));
    });

    this.app.get("/state", (req, res) => {
      res.json(this.state.getSnapshot());
    });
  }

  private setupWebSocket() {
    this.wss.on("connection", (ws: WebSocket) => {
      // Send initial state
      ws.send(JSON.stringify({ type: "SYNC", state: this.state.getSnapshot() }));

      ws.on("message", (data) => {
        try {
          const payload = JSON.parse(data.toString());
          // Handle client-side updates if allowed
        } catch (e) {}
      });
    });
  }

  public broadcast(payload: any) {
    const data = JSON.stringify(payload);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  public async start() {
    return new Promise<void>((resolve) => {
      this.httpServer.listen(this.port, () => {
        console.log(chalk.green(`[Canvas] Server listening on http://localhost:${this.port}`));
        resolve();
      });
    });
  }

  public getState() {
    return this.state;
  }
}
