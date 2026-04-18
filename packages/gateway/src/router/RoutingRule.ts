import { z } from "zod";

export const RoutingRuleSchema = z.object({
  id: z.string(),
  type: z.enum(["channel", "peer", "account", "keyword", "default"]),
  priority: z.number().default(100),
  targetAgentId: z.string(),
  
  // Rule specific fields
  channelId: z.string().optional(),
  peerId: z.string().optional(),
  accountId: z.string().optional(),
  keyword: z.string().optional(),
});

export type RoutingRule = z.infer<typeof RoutingRuleSchema>;
