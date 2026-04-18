import { z } from "zod";

export const OutboundMessageSchema = z.object({
  content: z.string(),
  contentType: z.enum(["text", "image", "audio", "file", "markdown"]),
  replyTo: z.string().optional(),
  mediaUrl: z.string().optional(),
  mediaCaption: z.string().optional(),
  buttons: z.array(z.object({
    id: z.string(),
    label: z.string(),
    value: z.string().optional()
  })).optional(),
  parseMode: z.enum(["none", "markdown", "html"]).default("none"),
});

export type OutboundMessage = z.infer<typeof OutboundMessageSchema>;
