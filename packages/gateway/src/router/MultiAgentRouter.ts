import { z } from "zod";

export const RoutingRuleSchema = z.object({
  id: z.string(),
  type: z.enum(["channel", "peer", "account", "keyword", "group", "default"]),
  priority: z.number().default(100),
  targetAgentId: z.string(),
  targetWorkspace: z.string().optional(),
  
  channelId: z.string().optional(),
  peerId: z.string().optional(),
  accountId: z.string().optional(),
  keyword: z.string().optional(),
  groupId: z.string().optional(),
  
  requireMention: z.boolean().default(false),
  requireReply: z.boolean().default(false),
  isolationMode: z.enum(["shared", "isolated", "sandbox"]).default("isolated"),
});

export type RoutingRule = z.infer<typeof RoutingRuleSchema>;

export const MultiAgentConfigSchema = z.object({
  agents: z.record(z.string(), z.object({
    id: z.string(),
    name: z.string(),
    workspace: z.string(),
    soulPath: z.string().optional(),
    toolsPath: z.string().optional(),
    channels: z.array(z.string()).default([]),
    model: z.string().optional(),
    temperature: z.number().optional(),
    maxTokens: z.number().optional(),
  })),
  
  routing: z.object({
    defaultAgentId: z.string(),
    rules: z.array(RoutingRuleSchema).default([]),
  }),
  
  session: z.object({
    isolation: z.enum(["shared", "isolated", "sandbox"]).default("isolated"),
    historyLimit: z.number().default(100),
    contextWindow: z.number().default(128000),
  }),
});

export type MultiAgentConfig = z.infer<typeof MultiAgentConfigSchema>;

export class MultiAgentRouter {
  private agents: Map<string, MultiAgentConfig["agents"][string]> = new Map();
  private rules: RoutingRule[] = [];
  private defaultAgentId: string = "main";
  private sessionMap: Map<string, string> = new Map();

  constructor(config?: MultiAgentConfig) {
    if (config) {
      this.loadConfig(config);
    }
  }

  private loadConfig(config: MultiAgentConfig): void {
    this.defaultAgentId = config.routing.defaultAgentId;
    this.rules = config.routing.rules;
    
    for (const [id, agent] of Object.entries(config.agents)) {
      this.agents.set(id, agent);
    }
  }

  public setConfig(config: MultiAgentConfig): void {
    this.loadConfig(config);
  }

  public route(channelId: string, peerId: string, content: string, groupId?: string): string {
    for (const rule of this.rules.sort((a, b) => b.priority - a.priority)) {
      if (this.matchesRule(rule, channelId, peerId, content, groupId)) {
        return rule.targetAgentId;
      }
    }
    return this.defaultAgentId;
  }

  private matchesRule(rule: RoutingRule, channelId: string, peerId: string, content: string, groupId?: string): boolean {
    switch (rule.type) {
      case "channel":
        return rule.channelId === channelId;
      case "peer":
        return rule.peerId === peerId;
      case "keyword":
        return rule.keyword ? content.includes(rule.keyword) : false;
      case "group":
        return rule.groupId === groupId;
      case "account":
        return false;
      case "default":
        return true;
      default:
        return false;
    }
  }

  public getAgentConfig(agentId: string): MultiAgentConfig["agents"][string] | undefined {
    return this.agents.get(agentId);
  }

  public getAgentWorkspace(agentId: string): string {
    const config = this.agents.get(agentId);
    return config?.workspace || `~/.hiru/agents/${agentId}`;
  }

  public getSessionKey(channelId: string, peerId: string): string {
    const key = `${channelId}:${peerId}`;
    if (!this.sessionMap.has(key)) {
      this.sessionMap.set(key, `session_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    }
    return this.sessionMap.get(key)!;
  }

  public clearSession(channelId: string, peerId: string): void {
    const key = `${channelId}:${peerId}`;
    this.sessionMap.delete(key);
  }

  public listAgents(): string[] {
    return Array.from(this.agents.keys());
  }

  public addAgent(id: string, config: MultiAgentConfig["agents"][string]): void {
    this.agents.set(id, config);
  }

  public removeAgent(id: string): void {
    this.agents.delete(id);
  }
}