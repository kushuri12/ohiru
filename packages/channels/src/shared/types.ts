import { z } from "zod";

export const ChannelTypeSchema = z.enum([
  "telegram", "discord", "slack", "whatsapp", "signal", 
  "matrix", "irc", "webchat", "ntfy", "email", 
  "cli-chat", "discord-webhook", "custom"
]);

export type ChannelType = z.infer<typeof ChannelTypeSchema>;

export type ChannelStatus = "connected" | "disconnected" | "error" | "reconnecting";
