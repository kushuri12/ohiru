import { EventEmitter } from "events";
import express from "express";
import { createServer, Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";
import { CanvasState } from "../CanvasState.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface A2UIComponent {
  id: string;
  type: string;
  props: Record<string, any>;
  children?: A2UIComponent[];
}

export interface CanvasUpdate {
  type: string;
  component?: A2UIComponent;
  action?: string;
  target?: string;
  props?: Record<string, any>;
}

export class A2UIServer extends EventEmitter {
  private app = express();
  private httpServer: Server;
  private wss: WebSocketServer;
  private port: number;
  private state: CanvasState;
  private connections: Set<WebSocket> = new Set();
  private componentRegistry: Map<string, any> = new Map();

  constructor(port: number = 18791) {
    super();
    this.port = port;
    this.state = new CanvasState();
    this.httpServer = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.httpServer });
    this.registerDefaultComponents();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private registerDefaultComponents() {
    const components = [
      "text", "image", "button", "input", "select", "checkbox", "radio",
      "card", "list", "grid", "chart", "table", "form", "modal",
      "sidebar", "header", "footer", "container", "stack", "row", "column",
      "markdown", "code", "terminal", "file", "avatar", "badge", "chip",
      "divider", "spacer", "progress", "slider", "toggle", "tabs", "tree"
    ];
    for (const type of components) {
      this.componentRegistry.set(type, { render: this.defaultRender.bind(this, type) });
    }
  }

  private defaultRender(type: string, props: Record<string, any>): string {
    return `<div data-a2ui-type="${type}" ${Object.entries(props).map(([k, v]) => `${k}="${v}"`).join(" ")}></div>`;
  }

  private setupRoutes() {
    this.app.get("/", (req, res) => {
      res.sendFile(path.join(__dirname, "ui", "A2UIApp.html"));
    });

    this.app.get("/state", (req, res) => {
      res.json(this.state.getSnapshot());
    });

    this.app.get("/api/components", (req, res) => {
      res.json(Array.from(this.componentRegistry.keys()));
    });

    this.app.post("/api/render", express.json(), (req, res) => {
      const { component } = req.body;
      const html = this.renderComponent(component);
      res.json({ html });
    });
  }

  private setupWebSocket() {
    this.wss.on("connection", (ws: WebSocket) => {
      this.connections.add(ws);
      ws.send(JSON.stringify({ type: "SYNC", state: this.state.getSnapshot() }));

      ws.on("message", (data) => {
        try {
          const payload = JSON.parse(data.toString());
          this.handleMessage(payload, ws);
        } catch (e) {
          console.error(chalk.red("[A2UI] Parse error:"), e);
        }
      });

      ws.on("close", () => {
        this.connections.delete(ws);
      });
    });
  }

  private handleMessage(payload: any, ws: WebSocket) {
    switch (payload.type) {
      case "RENDER":
        this.handleRender(payload, ws);
        break;
      case "UPDATE":
        this.handleUpdate(payload);
        break;
      case "ACTION":
        this.handleAction(payload);
        break;
      case "INTERACT":
        this.handleInteract(payload);
        break;
    }
  }

  private handleRender(payload: any, ws: WebSocket) {
    const { component } = payload;
    const html = this.renderComponent(component);
    this.state.update(component);
    ws.send(JSON.stringify({ type: "RENDERED", html, componentId: component?.id }));
  }

  private handleUpdate(payload: CanvasUpdate) {
    if (payload.component) {
      this.state.update(payload.component);
      this.broadcast({ ...payload, type: "UPDATED" });
    }
  }

  private handleAction(payload: any) {
    this.emit("action", payload);
    this.broadcast({ type: "ACTION_COMPLETE", action: payload.action });
  }

  private handleInteract(payload: any) {
    this.emit("interact", payload);
    this.broadcast({ type: "INTERACT_COMPLETE", ...payload });
  }

  public renderComponent(component: A2UIComponent): string {
    const renderer = this.componentRegistry.get(component.type);
    if (!renderer) {
      return `<div data-a2ui-type="${component.type}" data-id="${component.id}"></div>`;
    }
    return renderer.render(component.props, component.children);
  }

  public broadcast(payload: any) {
    const data = JSON.stringify(payload);
    for (const ws of this.connections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  public async render(agentId: string, component: A2UIComponent): Promise<string> {
    return this.renderComponent(component);
  }

  public async update(agentId: string, update: CanvasUpdate): Promise<void> {
    this.handleUpdate(update);
  }

  public async executeAction(agentId: string, action: string, target: string, props: Record<string, any>): Promise<any> {
    const payload = { type: "ACTION", action, target, props, agentId };
    this.handleAction(payload);
    return { success: true };
  }

  public async start() {
    return new Promise<void>((resolve) => {
      this.httpServer.listen(this.port, () => {
        console.log(chalk.green(`[A2UI] Server listening on http://localhost:${this.port}`));
        resolve();
      });
    });
  }

  public getState() {
    return this.state;
  }
}