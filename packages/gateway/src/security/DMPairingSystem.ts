import { z } from "zod";
import path from "path";
import os from "os";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { randomBytes } from "crypto";
import chalk from "chalk";

export const PairingPolicySchema = z.enum(["open", "pairing", "closed"]);

export interface PairingCode {
  code: string;
  channelId: string;
  peerId: string;
  peerName: string;
  createdAt: number;
  expiresAt: number;
}

export interface AllowedSender {
  channelId: string;
  peerId: string;
  peerName: string;
  addedAt: number;
}

export const ChannelSecurityConfigSchema = z.object({
  channelId: z.string(),
  dmPolicy: PairingPolicySchema.default("pairing"),
  allowFrom: z.array(z.string()).default([]),
  requireMention: z.boolean().default(false),
  groupPolicy: z.object({
    allowFrom: z.array(z.string()).default([]),
    requireMention: z.boolean().default(true),
  }).default({}),
});

export type ChannelSecurityConfig = z.infer<typeof ChannelSecurityConfigSchema>;

export class DMPairingSystem {
  private configDir: string;
  private pendingCodes: Map<string, PairingCode> = new Map();
  private allowedSenders: Map<string, AllowedSender> = new Map();
  private codeExpiryMs: number = 5 * 60 * 1000;
  
  constructor(configDir?: string) {
    this.configDir = configDir || path.join(os.homedir(), ".hiru", "security");
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    mkdirSync(this.configDir, { recursive: true });
  }

  public generateCode(channelId: string, peerId: string, peerName: string): string {
    const code = randomBytes(3).toString("hex").toUpperCase();
    const now = Date.now();
    
    const pairingCode: PairingCode = {
      code,
      channelId,
      peerId,
      peerName,
      createdAt: now,
      expiresAt: now + this.codeExpiryMs,
    };
    
    this.pendingCodes.set(code, pairingCode);
    
    setTimeout(() => this.pendingCodes.delete(code), this.codeExpiryMs);
    
    console.log(chalk.cyan(`[Pairing] Generated code ${code} for ${peerName} (${channelId})`));
    return code;
  }

  public async approve(code: string): Promise<boolean> {
    const pairing = this.pendingCodes.get(code);
    if (!pairing) {
      console.log(chalk.yellow(`[Pairing] Code ${code} not found or expired`));
      return false;
    }
    
    if (Date.now() > pairing.expiresAt) {
      this.pendingCodes.delete(code);
      console.log(chalk.yellow(`[Pairing] Code ${code} expired`));
      return false;
    }
    
    const allowed: AllowedSender = {
      channelId: pairing.channelId,
      peerId: pairing.peerId,
      peerName: pairing.peerName,
      addedAt: Date.now(),
    };
    
    const key = `${pairing.channelId}:${pairing.peerId}`;
    this.allowedSenders.set(key, allowed);
    this.pendingCodes.delete(code);
    
    console.log(chalk.green(`[Pairing] Approved ${pairing.peerName}`));
    return true;
  }

  public reject(code: string): void {
    this.pendingCodes.delete(code);
  }

  public isAllowed(channelId: string, peerId: string): boolean {
    const key = `${channelId}:${peerId}`;
    return this.allowedSenders.has(key);
  }

  public removeAllowed(channelId: string, peerId: string): void {
    const key = `${channelId}:${peerId}`;
    this.allowedSenders.delete(key);
  }

  public listAllowed(channelId?: string): AllowedSender[] {
    if (channelId) {
      return Array.from(this.allowedSenders.values()).filter(a => a.channelId === channelId);
    }
    return Array.from(this.allowedSenders.values());
  }

  public async checkMessage(channelId: string, peerId: string, content: string, config: ChannelSecurityConfig): Promise<{
    allowed: boolean;
    reason?: string;
    action?: "approve" | "reject" | "block";
  }> {
    if (config.dmPolicy === "open") {
      return { allowed: true };
    }
    
    if (config.dmPolicy === "closed") {
      return { allowed: false, reason: "Channel is closed to DMs" };
    }
    
    if (config.dmPolicy === "pairing") {
      if (this.isAllowed(channelId, peerId)) {
        return { allowed: true };
      }
      
      if (config.allowFrom.includes(peerId)) {
        return { allowed: true };
      }
      
      return {
        allowed: false,
        reason: "Please pair your account first",
        action: "approve"
      };
    }
    
    return { allowed: false };
  }
}