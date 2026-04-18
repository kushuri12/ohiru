import { z } from "zod";

export const SessionStateSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  channelId: z.string(),
  peerId: z.string(),
  history: z.array(z.any()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  metadata: z.record(z.any()).default({}),
});

export type SessionState = z.infer<typeof SessionStateSchema>;
