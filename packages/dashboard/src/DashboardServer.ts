import express from "express";
import { createServer, Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class DashboardServer {
  private app = express();
  private httpServer: Server;
  private wss: WebSocketServer;
  private port: number;

  constructor(port: number) {
    this.port = port;
    this.httpServer = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupRoutes() {
    this.app.get("/", (req, res) => {
      res.sendFile(path.join(__dirname, "ui", "dashboard.html"));
    });

    this.app.get("/api/config", (req, res) => {
      // Return redacted config
      res.json({ provider: "openai", model: "gpt-4o" });
    });
  }

  private setupWebSocket() {
    this.wss.on("connection", (ws: WebSocket) => {
      console.log(chalk.gray(`[Dashboard] User connected via WebSocket`));
      
      // Heartbeat or updates from agent
      const interval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "STATS_UPDATE", stats: { uptime: process.uptime(), messages: 42 } }));
        }
      }, 5000);

      ws.on("close", () => clearInterval(interval));
    });
  }

  public async start() {
    return new Promise<void>((resolve) => {
      this.httpServer.listen(this.port, () => {
        console.log(chalk.green(`[Dashboard] Running at http://localhost:${this.port}`));
        resolve();
      });
    });
  }
}
