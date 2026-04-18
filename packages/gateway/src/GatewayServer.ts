import { WebSocketServer, WebSocket } from "ws";
import express from "express";
import { createServer, Server } from "http";
import { EventEmitter } from "events";
import chalk from "chalk";
import { v4 as uuidv4 } from "uuid";
import { SessionRegistry } from "./session/SessionRegistry.js";
import { MessageRouter } from "./router/MessageRouter.js";
import { GatewayMetrics } from "./metrics/GatewayMetrics.js";

export interface GatewayOptions {
  port: number;
  bindHost?: string;
}

export class GatewayServer extends EventEmitter {
  private app = express();
  private httpServer: Server;
  private wss: WebSocketServer;
  private options: GatewayOptions;
  
  private sessionRegistry = new SessionRegistry();
  private router = new MessageRouter();
  private metrics = new GatewayMetrics();

  private activeAgents = new Map<string, WebSocket>();
  private activeChannels = new Map<string, WebSocket>();

  constructor(options: GatewayOptions) {
    super();
    this.options = options;
    this.httpServer = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupRoutes() {
    this.app.get("/health", (req, res) => {
      res.json({
        status: "ok",
        uptime: process.uptime(),
        channels: this.activeChannels.size,
        agents: this.activeAgents.size,
        version: "1.0.0-PRO"
      });
    });

    this.app.get("/metrics", (req, res) => {
      res.json(this.metrics.getSnapshot());
    });
  }

  private setupWebSocket() {
    this.wss.on("connection", (ws: WebSocket, req) => {
      const id = uuidv4();
      const type = req.headers["x-hiru-type"] as string; // 'agent' or 'channel'
      const name = req.headers["x-hiru-name"] as string;

      if (type === "agent") {
        this.activeAgents.set(id, ws);
        this.emit("agent:spawn", { id, name });
        console.log(chalk.green(`[Gateway] Agent connected: ${name} (${id})`));
      } else if (type === "channel") {
        this.activeChannels.set(id, ws);
        this.emit("channel:connect", { id, name });
        console.log(chalk.cyan(`[Gateway] Channel connected: ${name} (${id})`));
      }

      ws.on("message", (data) => {
        const startTime = Date.now();
        try {
          const message = JSON.parse(data.toString());
          this.emit("message", { id, type, message });
          
          this.router.route(message, id, (targetWs) => {
             targetWs.send(JSON.stringify(message));
          });

          this.metrics.recordMessage(type, Date.now() - startTime);
        } catch (err) {
          this.metrics.recordError();
          console.error(chalk.red("[Gateway] Error processing message:"), err);
        }
      });

      ws.on("close", () => {
        if (type === "agent") {
          this.activeAgents.delete(id);
          this.emit("agent:destroy", { id, name });
          console.log(chalk.yellow(`[Gateway] Agent disconnected: ${name} (${id})`));
        } else if (type === "channel") {
          this.activeChannels.delete(id);
          this.emit("channel:disconnect", { id, name });
          console.log(chalk.yellow(`[Gateway] Channel disconnected: ${name} (${id})`));
        }
      });
    });
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      const host = this.options.bindHost || "127.0.0.1";
      this.httpServer.listen(this.options.port, host, () => {
        console.log(chalk.bold.hex("#CC785C")(`\n 🦞 O-HIRU GATEWAY `));
        console.log(chalk.gray(` Listening on ws://${host}:${this.options.port}\n`));
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.wss.close(() => {
        this.httpServer.close(() => resolve());
      });
    });
  }
}
