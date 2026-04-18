import { v4 as uuidv4 } from "uuid";
import { RoutingRule, RoutingRuleSchema } from "./RoutingRule.js";

export class MessageRouter {
  private rules: RoutingRule[] = [];

  constructor() {
    this.loadDefaultRules();
  }

  private loadDefaultRules() {
    // Default fallback rule
    this.rules.push({
      id: uuidv4(),
      type: "default",
      priority: 0,
      targetAgentId: "default-agent"
    });
  }

  public addRule(rule: RoutingRule) {
    const validated = RoutingRuleSchema.parse(rule);
    this.rules.push(validated);
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  public route(message: any, sourceId: string, sender: (targetWs: any) => void) {
    // In a real implementation, find the matching agent based on rules
    // For now, we simulate finding the 'default' target
    
    // Logic: 
    // 1. Check if message has explicit targetAgentId
    // 2. Scan rules (peer > account > channel > keyword > default)
    // 3. Dispatch
    
    // Example:
    // const rule = this.rules.find(r => this.matches(r, message));
    // if (rule) { ... }
  }

  private matches(rule: RoutingRule, message: any): boolean {
    switch (rule.type) {
      case "peer": return message.peerId === rule.peerId;
      case "channel": return message.channelId === rule.channelId;
      case "keyword": return message.content.includes(rule.keyword!);
      case "default": return true;
      default: return false;
    }
  }
}
