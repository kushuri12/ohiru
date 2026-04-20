import { EventEmitter } from "events";
import chalk from "chalk";
import { A2UIServer, A2UIComponent } from "../a2ui/A2UIServer.js";

export interface CanvasToolConfig {
  enabled: boolean;
  serverUrl?: string;
  maxComponents?: number;
}

export class CanvasTool extends EventEmitter {
  private server: A2UIServer | null = null;
  private config: CanvasToolConfig;
  private componentCache: Map<string, A2UIComponent> = new Map();

  constructor(config: CanvasToolConfig) {
    super();
    this.config = config;
  }

  public async initialize(): Promise<void> {
    if (this.config.enabled) {
      this.server = new A2UIServer();
      await this.server.start();
      console.log(chalk.green("[CanvasTool] A2UI server started"));
    }
  }

  public async renderText(text: string, options?: Record<string, any>): Promise<string> {
    if (!this.server) return "";
    const component: A2UIComponent = {
      id: `text_${Date.now()}`,
      type: "text",
      props: { ...options, content: text }
    };
    return this.server.render("agent", component);
  }

  public async renderCard(title: string, content: string, options?: Record<string, any>): Promise<string> {
    if (!this.server) return "";
    const component: A2UIComponent = {
      id: `card_${Date.now()}`,
      type: "card",
      props: { title, content, ...options }
    };
    return this.server.render("agent", component);
  }

  public async renderList(items: string[], options?: Record<string, any>): Promise<string> {
    if (!this.server) return "";
    const component: A2UIComponent = {
      id: `list_${Date.now()}`,
      type: "list",
      props: { items, ...options }
    };
    return this.server.render("agent", component);
  }

  public async renderChart(data: any, chartType: string = "bar"): Promise<string> {
    if (!this.server) return "";
    const component: A2UIComponent = {
      id: `chart_${Date.now()}`,
      type: "chart",
      props: { data, chartType }
    };
    return this.server.render("agent", component);
  }

  public async renderTable(columns: string[], rows: any[]): Promise<string> {
    if (!this.server) return "";
    const component: A2UIComponent = {
      id: `table_${Date.now()}`,
      type: "table",
      props: { columns, rows }
    };
    return this.server.render("agent", component);
  }

  public async renderMarkdown(markdown: string): Promise<string> {
    if (!this.server) return "";
    const component: A2UIComponent = {
      id: `md_${Date.now()}`,
      type: "markdown",
      props: { content: markdown }
    };
    return this.server.render("agent", component);
  }

  public async renderCode(code: string, language: string = "javascript"): Promise<string> {
    if (!this.server) return "";
    const component: A2UIComponent = {
      id: `code_${Date.now()}`,
      type: "code",
      props: { code, language }
    };
    return this.server.render("agent", component);
  }

  public async showImage(url: string, caption?: string): Promise<string> {
    if (!this.server) return "";
    const component: A2UIComponent = {
      id: `img_${Date.now()}`,
      type: "image",
      props: { src: url, caption }
    };
    return this.server.render("agent", component);
  }

  public async clear(): Promise<void> {
    if (this.server) {
      this.server.broadcast({ type: "CLEAR" });
    }
  }

  public isEnabled(): boolean {
    return this.config.enabled;
  }

  public getServer(): A2UIServer | null {
    return this.server;
  }
}