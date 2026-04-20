import { z } from "zod";

export const ChannelTypeSchema = z.enum([
  "telegram", "discord", "slack", "whatsapp", "signal",
  "matrix", "irc", "webchat", "ntfy", "email",
  "cli-chat", "discord-webhook", 
  "line", "teams", "mattermost", "nostr", "wechat", "qq", "zalo",
  "imessage", "feishu", "twitch",
  "custom"
]);

export type ChannelTypeList = z.infer<typeof ChannelTypeSchema>;

export type ChannelType = z.infer<typeof ChannelTypeSchema>;

export type ChannelStatus = "connected" | "disconnected" | "error" | "reconnecting";
