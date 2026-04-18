import { z } from "zod";
import { ChannelTypeSchema } from "./types.js";

export const InboundMessageSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  channelType: ChannelTypeSchema,
  peerId: z.string(),
  peerName: z.string(),
  content: z.string(),
  contentType: z.enum(["text", "image", "audio", "file", "location"]),
  mediaUrl: z.string().optional(),
  replyTo: z.string().optional(),
  mentions: z.array(z.string()).default([]),
  timestamp: z.number(),
  metadata: z.record(z.any()).default({}),
}).passthrough();

export type InboundMessage = z.infer<typeof InboundMessageSchema>;
