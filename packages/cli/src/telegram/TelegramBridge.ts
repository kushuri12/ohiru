// src/telegram/TelegramBridge.ts
import { Bot, InputFile } from "grammy";
import { HiruAgent } from "../agent/Agent.js";
import { ProjectContext } from "shared";
import { TelegramFormatter, TOOL_EMOJI } from "./TelegramFormatter.js";
import { getReceivedPath, ensureHiruDirs, HIRU_DIR, resolveSafePath, isSafePath, HIRU_EXPORTS_DIR } from "../utils/paths.js";
import fetch from "node-fetch";
import fs from "node:fs/promises";
import pathMod from "node:path";

export interface TelegramBridgeConfig {
  botToken: string;
  allowedChatId: string;
}

export class TelegramBridge {
  private bot: Bot;
  private formatter = new TelegramFormatter();
  private isProcessing = false;
  private currentChatId: number | null = null;

  // Per-run tracking
  private toolCallsInRun = 0;
  private doneHandled = false;
  private responseBuffer = "";
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private lastFlushTime = 0;
  private isFlushing = false;
  private currentStatusMsgId: number | null = null;
  private currentResponseMsgId: number | null = null;
  private pendingPlanResolve: ((v: boolean) => void) | null = null;
  private pendingPermResolve: ((v: boolean) => void) | null = null;
  private telegramHistory: any[] = [];
  private lastFlushedText = "";
  private lastSealTime = 0;
  private lastTokenBatch = "";           // Track last batch of tokens to detect repetition
  private tokenRepeatCount = 0;          // Count consecutive repeated token batches
  private sentResponseTexts = new Set<string>(); // Track sent responses to prevent duplicates

  // Queue: collect files to send AFTER runStreaming completes (avoids race conditions)
  private pendingScreenshots: string[] = [];
  private pendingFiles: Array<{ path: string; caption?: string }> = [];

  constructor(
    private agent: HiruAgent,
    private ctx: ProjectContext,
    private config: TelegramBridgeConfig
  ) {
    this.bot = new Bot(config.botToken);
    this.telegramHistory = [...agent.messages]; // Pre-populate from restored session
    this.setupErrorHandler();
    this.setupGuard();
    this.setupCommands();
    this.setupMessageHandler();
    this.setupAgentListeners();
  }

  private setupErrorHandler() {
    this.bot.catch((err) => {
      console.error(`  ❌ Telegram Error: ${err.message}`);
    });
  }

  private resetRunState() {
    this.toolCallsInRun = 0;
    this.doneHandled = false;
    this.responseBuffer = "";
    this.pendingScreenshots = [];
    this.pendingFiles = [];
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
    this.currentResponseMsgId = null;
    this.lastFlushedText = "";
    this.lastFlushTime = 0;
    this.lastTokenBatch = "";
    this.tokenRepeatCount = 0;
    this.sentResponseTexts.clear();
  }

  private async registerTelegramTools() {
    const bridge = this;
    const { z } = await import("zod");
    const { internalTools } = await import("../tools/index.js");

    const originalScreenshot = internalTools.take_screenshot;
    if (originalScreenshot) {
      internalTools.take_screenshot = {
        ...originalScreenshot,
        execute: async (args: any) => {
          const result = await originalScreenshot.execute(args);
          // Parse the returned JSON and queue the screenshot path
          try {
            const parsed = typeof result === "string" ? JSON.parse(result) : result;
            if (parsed?.path) {
              console.log(`  📸 Screenshot captured: ${parsed.path}`);
              bridge.pendingScreenshots.push(parsed.path);
            }
          } catch {}
          return result;
        },
      };
    }

    (this.agent as any).tools.save_to_exports = {
      description: `Save a file to Hiru's permanent exports folder (~/.hiru/exports).
Use this for files the user wants to keep globally or access via Telegram sharing.`,
      parameters: z.object({
        path: z.string().describe("Source file path to save to exports folder"),
        filename: z.string().optional().describe("Optional new filename in exports folder"),
      }),
      execute: async (args: any) => {
        const { path: srcPath, filename } = args;
        const resolvedSrc = resolveSafePath(srcPath);
        
        // Security check
        if (!isSafePath(resolvedSrc)) {
          return `❌ Permission denied for path: ${srcPath}. You can only save files from within the project directory or ~/.hiru/`;
        }

        const baseName = filename || pathMod.basename(resolvedSrc);
        const destPath = pathMod.join(HIRU_EXPORTS_DIR, baseName);
        
        await fs.copyFile(resolvedSrc, destPath);
        return `✅ File exported to exports folder: ${destPath}`;
      },
    };

    (this.agent as any).tools.send_to_chat = {
      description: `Send a file to the user's Telegram chat.
Use this AFTER creating/writing a file to deliver it to the user.
Works for: documents (.txt, .pdf, .docx), images (.png, .jpg), code files, etc.
Example: send_to_chat({ path: "report.txt", caption: "Here's your report" })`,
      parameters: z.object({
        path: z.string().describe("File path to send"),
        caption: z.string().optional().describe("Optional caption for the file"),
      }),
      execute: async (args: any) => {
        const { path: filePath, caption } = args;
        bridge.pendingFiles.push({ path: filePath, caption });
        return `✓ File queued for sending: ${filePath}`;
      },
    };
  }

  private setupGuard() {
    this.bot.use(async (ctx, next) => {
      if (String(ctx.chat?.id) !== this.config.allowedChatId) {
        await ctx.reply("⛔ Access denied.");
        return;
      }
      await next();
    });
  }

  private setupCommands() {
    this.bot.command("help", async (ctx) => {
      await ctx.reply(
        `*Hiru — Remote Control*\n\n` +
        `Example commands:\n` +
        `• \`open notepad\`\n` +
        `• \`type hello world\`\n` +
        `• \`press ctrl+s\`\n` +
        `• \`screenshot\` — capture and send screen\n` +
        `• \`open chrome youtube.com\`\n` +
        `• \`create file notes.txt content: buy milk\`\n` +
        `• \`run npm install\`\n` +
        `• \`make a report then send it here\`\n\n` +
        `*Commands:*\n` +
        `/status — check status\n` +
        `/model <provider> [model] — change AI provider\n` +
        `/stop — cancel current task\n` +
        `/clear — clear telegram history\n` +
        `/help — show this help`,
        { parse_mode: "Markdown" }
      );
    });

    this.bot.command("status", async (ctx) => {
      const memMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      await ctx.reply(
        `*Status:* ${this.isProcessing ? "⚡ Processing task..." : "✅ Ready"}\n` +
        `*Project:* \`${this.ctx.root}\`\n` +
        `*Provider:* \`${(this.agent as any).config?.provider || "unknown"}\`\n` +
        `*Model:* \`${(this.agent as any).config?.model || "unknown"}\`\n` +
        `*Memory:* ${memMB}MB`,
        { parse_mode: "Markdown" }
      );
    });

    this.bot.command("model", async (ctx) => {
      const args = (ctx.match || "").trim().split(" ");
      if (!args[0]) {
        await ctx.reply("Usage: /model <provider> [model]\nExample: /model google gemini-2.5-pro\nExample: /model anthropic claude-3-5-sonnet-latest\nExample: /model openai gpt-4o");
        return;
      }

      const { PROVIDERS } = await import("../providers/index.js");
      const { saveConfig } = await import("../utils/config.js");

      const providerId = args[0].toLowerCase();
      const modelName = args[1] || "";
      
      const providerDef = PROVIDERS.find(p => p.id === providerId);
      if (!providerDef) {
        await ctx.reply(`❌ Unknown provider: *${providerId}*`, { parse_mode: "Markdown" });
        return;
      }

      const newConfig = { ...this.agent.config, provider: providerId };
      
      if (modelName) {
        newConfig.model = modelName;
      } else {
        // Pick recommended model if not specified
        const recommended = providerDef.models.find(m => m.recommended) || providerDef.models[0];
        if (recommended) {
          newConfig.model = recommended.id;
        }
      }

      // Try searching for API key in env if it might have changed
      if (providerDef.apiKeyEnv) {
        const envKey = process.env[providerDef.apiKeyEnv] || process.env.HIRU_API_KEY;
        if (envKey) newConfig.apiKey = envKey;
      }

      try {
        if (providerId === "ollama") {
          await ctx.reply(`⚙️ Checking Ollama model *${newConfig.model}*...`, { parse_mode: "Markdown" });
          const { ensureOllamaModel } = await import("../providers/index.js");
          await ensureOllamaModel(newConfig.baseUrl, newConfig.model, async (msg) => {
            await ctx.reply(msg, { parse_mode: "Markdown" });
          }).catch(err => {
             console.error(`[Ollama Pull Error] ${err.message}`);
          });
        }

        this.agent.updateConfig(newConfig);
        await saveConfig(newConfig);
        await ctx.reply(`✅ **AI Provider Updated & Saved**\n\n• Provider: \`${providerId}\` \n• Model: \`${newConfig.model || "default"}\`\n\nChanges applied immediately and saved to \`.hirurc\`.`, { parse_mode: "Markdown" });
      } catch (e: any) {
        await ctx.reply(`❌ Failed to update config: ${e.message}`);
      }
    });

    this.bot.command("stop", async (ctx) => {
      if (!this.isProcessing) { await ctx.reply("No active task."); return; }
      (this.agent as any).currentAbortController?.abort();
      this.isProcessing = false;
      await ctx.reply("🛑 Task cancelled.");
    });

    this.bot.command("plan", async (ctx) => {
      const arg = ctx.match?.toLowerCase().trim();
      if (arg === "on" || arg === "off") {
        this.agent.updateConfig({ ...(this.agent as any).config, planMode: arg === "on" });
        await ctx.reply(`📋 Plan mode: *${arg.toUpperCase()}*`, { parse_mode: "Markdown" });
      }
    });

    this.agent.on("planApproved", () => {
      this.sealResponse();
    });

    this.bot.command("clear", async (ctx) => {
      this.telegramHistory = [];
      await ctx.reply("🧹 Telegram history cleared. Context is now fresh.");
    });

    this.bot.command("plugin", async (ctx) => {
      const match = ctx.match || "";
      const args = match.split(" ").filter(Boolean);
      const action = args[0];
      const source = args.slice(1).join(" ");

      if (!action) {
        await ctx.reply("Usage: /plugin <install|uninstall|update|enable|disable|list> [source]");
        return;
      }

      if (action === "install" && source) {
        await ctx.reply(`📦 Installing plugin from ${source}...`);
        try {
          const result = await this.agent.pluginManager.install(source);
          await ctx.reply(result.success ? `✅ Plugin "${result.name}" installed successfully!` : `❌ Failed to install: ${result.error}`);
        } catch (e: any) {
          await ctx.reply(`❌ Error: ${e.message}`);
        }
      } else if (action === "uninstall" && source) {
        const result = await this.agent.pluginManager.uninstall(source);
        await ctx.reply(result.success ? `🗑️ Plugin "${source}" uninstalled.` : `❌ ${result.error}`);
      } else if (action === "update" && source) {
        await ctx.reply(`🔄 Updating ${source}...`);
        const result = await this.agent.pluginManager.update(source);
        await ctx.reply(result.success ? `✅ Plugin "${source}" updated!` : `❌ ${result.error}`);
      } else if (action === "enable" && source) {
        const ok = await this.agent.pluginManager.enable(source);
        await ctx.reply(ok ? `✅ Plugin "${source}" enabled.` : `❌ Plugin "${source}" not found.`);
      } else if (action === "disable" && source) {
        const ok = await this.agent.pluginManager.disable(source);
        await ctx.reply(ok ? `⏸️ Plugin "${source}" disabled.` : `❌ Plugin "${source}" not found.`);
      } else if (action === "list") {
        const plugins = this.agent.pluginManager.listPlugins();
        if (plugins.length === 0) {
          await ctx.reply("No plugins installed. Use /plugin install <github-url>");
        } else {
          const list = plugins.map(p => {
            const emoji = p.status === "active" ? "✅" : p.status === "disabled" ? "⏸️" : "❌";
            return `${emoji} ${p.name} v${p.version} [${p.format}]`;
          }).join("\n");
          await ctx.reply(`📦 Installed Plugins (${plugins.length}):\n${list}`);
        }
      } else {
        await ctx.reply(`Unknown action: ${action}`);
      }
    });

    this.bot.command("skill", async (ctx) => {
      const match = ctx.match || "";
      const args = match.split(" ").filter(Boolean);
      const action = args[0];

      if (!action) {
        await ctx.reply("Usage: /skill <list|create|delete|test> [args]");
        return;
      }

      if (action === "list") {
        const skills = this.agent.skillManager.listSkills();
        if (skills.length === 0) {
          await ctx.reply("No skills installed.");
        } else {
          const list = skills.map(s => {
            const status = s.testResult ? (s.testResult.success ? "✅" : "❌") : "⚠️";
            return `${status} ${s.name} (v${s.version})`;
          }).join("\n");
          await ctx.reply(`🎯 Installed Skills (${skills.length}):\n${list}`);
        }
      } else if (action === "delete" && args[1]) {
        await this.agent.skillManager.deleteSkill(args[1]);
        await ctx.reply(`🗑️ Skill "${args[1]}" deleted.`);
      } else if (action === "create" && args[1]) {
        await ctx.reply(`📂 Skill directory: ${this.agent.skillManager.dir}\nCreate a folder "${args[1]}" there.`);
      } else if (action === "test" && args[1]) {
        let testArgs = {};
        if (args[2]) {
          try { testArgs = JSON.parse(args.slice(2).join(" ")); } catch { 
            await ctx.reply("❌ Test args must be valid JSON");
            return;
          }
        }
        const result = await this.agent.skillManager.testSkill(args[1], testArgs);
        await ctx.reply(result.success ? `✅ Skill "${args[1]}" passed!\nOutput: ${result.output}` : `❌ Skill "${args[1]}" failed: ${result.output}`);
      } else {
        await ctx.reply(`Unknown action: ${action}`);
      }
    });
  }

  private setupMessageHandler() {
    this.bot.on("message:text", async (ctx) => {
      this.currentChatId = ctx.chat.id;
      const text = ctx.message.text.toLowerCase().trim();

      if (this.pendingPlanResolve || this.pendingPermResolve) {
        const isYes = ["ya", "y", "yes", "ok", "continue", "sip", "yup", "gas", "✅ yes, continue"].includes(text);
        const isNo = ["tidak", "n", "no", "cancel", "stop", "❌ cancel"].includes(text);

        if (isYes || isNo) {
          if (this.pendingPlanResolve) {
            const resolve = this.pendingPlanResolve;
            this.pendingPlanResolve = null;
            if (isYes && this.currentChatId && this.currentStatusMsgId) {
              try { await this.bot.api.editMessageText(this.currentChatId, this.currentStatusMsgId, "⚡ *Starting execution...*", { parse_mode: "Markdown" }); } catch {}
            }
            resolve(isYes);
          } else if (this.pendingPermResolve) {
            const resolve = this.pendingPermResolve;
            this.pendingPermResolve = null;
            resolve(isYes);
          }
          return;
        }
      }

      if (this.isProcessing) {
        await ctx.reply("⏳ Still processing. Wait or /stop first.");
        return;
      }

      this.currentChatId = ctx.chat.id;
      this.isProcessing = true;
      this.resetRunState();

      const ack = await ctx.reply("⏳ _Thinking..._", { parse_mode: "Markdown" });
      this.currentStatusMsgId = ack.message_id;

      try {
        await this.agent.runStreaming(ctx.message.text, this.ctx);
        this.telegramHistory = [...this.agent.messages];

        // Don't flush here — let sealResponse (from onDone) handle the final flush.
        // This prevents double-flush which causes duplicate messages.
        if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
        
        // Only flush if onDone hasn't already handled it
        if (this.responseBuffer.trim() && !this.doneHandled) {
          await this.flushResponse();
        }

        const sentPaths = new Set<string>();
        for (const ssPath of this.pendingScreenshots) {
          if (sentPaths.has(ssPath)) continue;
          sentPaths.add(ssPath);
          await this.sendScreenshot(ssPath);
        }
        for (const file of this.pendingFiles) {
          if (sentPaths.has(file.path)) continue;
          sentPaths.add(file.path);
          await this.sendFileToChat(file.path, file.caption);
        }
        
        // Final check: if no response msg was sent and no buffer exists, notify user
        const finalFormatted = this.formatter.formatResponse(this.responseBuffer);
        if (!this.currentResponseMsgId && !finalFormatted) {
           await this.sendText("✅ Done (Internal process complete, no text output produced).");
        }

        const { saveSession } = await import("../memory/SessionManager.js");
        await saveSession({
          id: "telegram-session",
          name: "Telegram Control",
          projectRoot: this.ctx.root,
          messages: JSON.stringify(this.agent.messages),
          tokenUsage: JSON.stringify(this.agent.tokenUsage),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }).catch(err => console.error("  ❌ Failure saving Telegram session:", err));

      } catch (e: any) {
        await this.sendText(`❌ Error: ${e.message}`);
      } finally {
        this.isProcessing = false;
        if (this.currentStatusMsgId && this.currentChatId) {
          try { await this.bot.api.deleteMessage(this.currentChatId, this.currentStatusMsgId); } catch {}
          this.currentStatusMsgId = null;
        }
        this.currentChatId = null;
      }
    });

    this.bot.on(["message:document", "message:photo", "message:video", "message:audio"], async (ctx) => {
      if (this.isProcessing) {
        await ctx.reply("⏳ Still processing. Wait or /stop first.");
        return;
      }

      this.currentChatId = ctx.chat.id;
      this.isProcessing = true;
      this.resetRunState();

      const ack = await ctx.reply("⏳ _Receiving file..._", { parse_mode: "Markdown" });
      this.currentStatusMsgId = ack.message_id;

      try {
        await ensureHiruDirs();

        let file;
        let originalName = `file-${Date.now()}`;

        if (ctx.message.document) {
          file = await ctx.getFile();
          originalName = ctx.message.document.file_name || `doc-${Date.now()}`;
        } else if (ctx.message.photo) {
          const largestPhoto = ctx.message.photo[ctx.message.photo.length - 1];
          file = await ctx.api.getFile(largestPhoto.file_id);
          originalName = `photo-${Date.now()}.jpg`;
        } else if (ctx.message.video) {
          file = await ctx.api.getFile(ctx.message.video.file_id);
          originalName = ctx.message.video.file_name || `video-${Date.now()}.mp4`;
        } else if (ctx.message.audio) {
          file = await ctx.api.getFile(ctx.message.audio.file_id);
          originalName = ctx.message.audio.file_name || `audio-${Date.now()}.mp3`;
        }

        if (!file) throw new Error("Could not retrieve file information.");

        // Update status: Downloading
        if (this.currentStatusMsgId && this.currentChatId) {
          try { await this.bot.api.editMessageText(this.currentChatId, this.currentStatusMsgId, `⏳ *Downloading:* \`${originalName}\`...`, { parse_mode: "Markdown" }); } catch {}
        }

        const destPath = getReceivedPath(originalName);
        const url = `https://api.telegram.org/file/bot${this.config.botToken}/${file.file_path}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`);
        
        const arrayBuffer = await response.arrayBuffer();
        const { writeFile } = await import("node:fs/promises");
        await writeFile(destPath, Buffer.from(arrayBuffer));

        // Update status: Processing
        if (this.currentStatusMsgId && this.currentChatId) {
          try { await this.bot.api.editMessageText(this.currentChatId, this.currentStatusMsgId, `⏳ *Processing:* \`${originalName}\`...`, { parse_mode: "Markdown" }); } catch {}
        }

        const caption = ctx.message.caption ? ctx.message.caption.trim() : "";
        
        if (!caption) {
          await ctx.reply(`✅ **File received**\n*Path:* \`${destPath}\``, { parse_mode: "Markdown" });
        }

        const isImage = /\.(jpe?g|png|webp|gif)$/i.test(originalName);
        let agentInput: string | any[] = "";

        if (isImage) {
          const { readFile } = await import("node:fs/promises");
          const imageBuffer = await readFile(destPath);
          
          agentInput = [
            { 
              type: "text", 
              text: `[USER SENT AN IMAGE]\nFile: ${originalName}\nSaved at: ${destPath}\n${caption ? `User Instruction: "${caption}"` : "Please describe what you see in this image and ask for instructions."}\n\nIMPORTANT: Use your vision capabilities to accurately process this image. Do not hallucinate.`
            },
            { type: "image", image: imageBuffer }
          ];
        } else {
          let agentPrompt = `[FILE RECEIVED]\nFile Name: ${originalName}\nSaved at: ${destPath}\n`;
          agentPrompt += caption ? `User Instruction: "${caption}"\n\nPlease process this file immediately.` : `Acknowledge this file and wait for further instructions.`;
          agentInput = agentPrompt;
        }
        
        await this.agent.runStreaming(agentInput, this.ctx);
        this.telegramHistory = [...this.agent.messages];
        await this.flushResponse();

      } catch (e: any) {
        await ctx.reply(`❌ Failed to save file: ${e.message}`);
      } finally {
        this.isProcessing = false;
        this.currentChatId = null;
      }
    });

    this.bot.callbackQuery("plan_approve", async (ctx) => {
      try { await ctx.answerCallbackQuery("✅ Approved!"); } catch (e) {}
      try { await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }); } catch {}
      if (this.pendingPlanResolve) {
        const resolve = this.pendingPlanResolve;
        this.pendingPlanResolve = null;
        if (this.currentChatId && this.currentStatusMsgId) {
          try { await this.bot.api.editMessageText(this.currentChatId, this.currentStatusMsgId, "⚡ *Starting execution...*", { parse_mode: "Markdown" }); } catch {}
        }
        resolve(true);
      } else {
        this.agent.resolvePlanApproval(true);
      }
    });

    this.bot.callbackQuery("plan_reject", async (ctx) => {
      try { await ctx.answerCallbackQuery("❌ Cancelled."); } catch (e) {}
      try { await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }); } catch {}
      this.agent.resolvePlanApproval(false);
      this.isProcessing = false;
    });

    this.bot.callbackQuery(/^perm_approve:(.+)$/, async (ctx) => {
      const toolName = ctx.match[1];
      try { await ctx.answerCallbackQuery(`✅ Executing ${toolName}`); } catch {}
      try { await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }); } catch {}
      const resolve = (this.agent as any).pendingPermResolve;
      if (resolve) {
        (this.agent as any).pendingPermResolve = null;
        resolve(true);
      }
    });

    this.bot.callbackQuery(/^perm_reject:(.+)$/, async (ctx) => {
      const toolName = ctx.match[1];
      try { await ctx.answerCallbackQuery(`❌ Rejected ${toolName}`); } catch {}
      try { await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }); } catch {}
      if (this.pendingPermResolve) {
        const resolve = (this.agent as any).pendingPermResolve;
        (this.agent as any).pendingPermResolve = null;
        resolve(false);
      }
    });
  }

  private async flushResponse(force = false): Promise<void> {
    if (!this.responseBuffer.trim() || !this.currentChatId) return;
    if (this.isFlushing) return;
    const now = Date.now();
    if (!force && now - this.lastFlushTime < 1500) {
      if (this.flushTimer) clearTimeout(this.flushTimer);
      this.flushTimer = setTimeout(() => this.flushResponse(), 1500 - (now - this.lastFlushTime));
      return;
    }
    this.isFlushing = true;
    try {
      const text = this.responseBuffer.trim();
      const formatted = this.formatter.formatResponse(text);
      
      // Dedup guard: don't send if we've already sent this exact response
      if (this.sentResponseTexts.has(text) && !this.currentResponseMsgId) {
        this.isFlushing = false;
        return;
      }
      
      if (formatted.length > 4000) {
        this.sentResponseTexts.add(text);
        this.responseBuffer = "";
        this.currentResponseMsgId = null;
        this.isFlushing = false;
        await this.sendText(formatted);
        return;
      }
      if (this.currentResponseMsgId && text !== this.lastFlushedText) {
        await this.bot.api.editMessageText(this.currentChatId, this.currentResponseMsgId, formatted, { parse_mode: "Markdown" });
      } else if (!this.currentResponseMsgId) {
        const msg = await this.bot.api.sendMessage(this.currentChatId, formatted, { parse_mode: "Markdown" });
        this.currentResponseMsgId = msg.message_id;
      }
      this.sentResponseTexts.add(text);
      this.lastFlushedText = text;
      this.lastFlushTime = Date.now();
    } catch (e: any) {
       // Only clear if it's NOT the "message is not modified" error
       if (!e.message?.includes("message is not modified")) {
         this.currentResponseMsgId = null;
       }
    } finally {
      this.isFlushing = false;
    }
  }

  private setupAgentListeners() {
    this.agent.on("status", async (msg: string) => {
      if (this.currentChatId && this.currentStatusMsgId) {
        try {
          await this.bot.api.editMessageText(this.currentChatId, this.currentStatusMsgId, `⏳ *${msg}*`, { parse_mode: "Markdown" });
        } catch (e) {}
      }
    });

    this.agent.on("token", (t: string) => {
      // Dedup guard: detect if the model is repeating itself
      // Check if this token batch is a repeat of what we've already buffered
      if (t.length > 20) {
        // For substantial token chunks, check if the buffer already ends with this text
        if (this.responseBuffer.endsWith(t)) {
          this.tokenRepeatCount++;
          if (this.tokenRepeatCount > 2) {
            // Model is looping — stop accumulating
            return;
          }
        } else {
          this.tokenRepeatCount = 0;
        }
        
        // Check if the entire token is a repetition of existing buffer content
        const bufferTrimmed = this.responseBuffer.trim();
        const tokenTrimmed = t.trim();
        if (bufferTrimmed.length > 50 && tokenTrimmed.length > 50 && bufferTrimmed.includes(tokenTrimmed)) {
          // Token content already exists in buffer — skip
          return;
        }
      }
      
      this.responseBuffer += t;
      if (this.flushTimer) clearTimeout(this.flushTimer);
      this.flushTimer = setTimeout(() => this.flushResponse(), 400);
    });

    this.agent.on("toolCall", async (chunk: any) => {
      this.toolCallsInRun++;
      if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
      await this.flushResponse();
      if (this.currentChatId && this.currentStatusMsgId) {
        const spinners = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
        const spinner = spinners[this.toolCallsInRun % spinners.length];
        try {
          await this.bot.api.editMessageText(this.currentChatId, this.currentStatusMsgId, `${spinner} *Executing Step ${this.toolCallsInRun}:* \`${chunk.toolName}\`...`, { parse_mode: "Markdown" });
        } catch (e) {}
      }
    });

    this.agent.on("toolResult", async (chunk: any) => {
      if (chunk.toolName === "take_screenshot" || chunk.toolName === "send_to_chat") return;
      const rawResult = chunk.result;
      const resultStr = typeof rawResult === "string" ? rawResult : JSON.stringify(rawResult ?? "");
      if (resultStr.includes("[ERROR]")) {
        // Kalau error, seal buffer dulu baru kirim pesan error terpisah
        await this.sealResponse();
        const errMsg = resultStr.split("\n").slice(0, 3).join("\n");
        await this.sendText(`❌ ${errMsg.slice(0, 300)}`);
      }
      // HAPUS sealResponse() di sini — biarkan "done" yang handle seal akhir
    });

    this.agent.on("planReady", async () => {
      await this.sealResponse();
    });

    this.agent.on("awaitingPlanApproval", async (plan: any) => {
      if (!this.currentChatId) return;
      if (this.currentStatusMsgId) {
        try { await this.bot.api.editMessageText(this.currentChatId, this.currentStatusMsgId, "📋 *Waiting for plan approval...*", { parse_mode: "Markdown" }); } catch {}
      }
      const planText = this.formatter.formatPlan(plan);
      await this.sendText(planText);
      this.pendingPlanResolve = (v: boolean) => this.agent.resolvePlanApproval(v);
      await this.bot.api.sendMessage(this.currentChatId, "📋 **Is this plan correct?**\n(Reply 'Yes' or use buttons)", {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            { text: "✅ Yes, Continue", callback_data: "plan_approve" },
            { text: "❌ Cancel",         callback_data: "plan_reject" },
          ]],
        },
      });
    });

    this.agent.on("modelWarning", async (msg: string) => {
      await this.sendText(`⚠️ ${msg}`);
    });

    this.agent.on("permissionRequest", async (req: any) => {
      if (!this.currentChatId) return;
      (this.agent as any).pendingPermResolve = req.resolve;
      const emoji = (TOOL_EMOJI as any)[req.toolName] ?? "⚙️";
      const argStr = JSON.stringify(req.args).slice(0, 100);
      await this.bot.api.sendMessage(this.currentChatId, 
        `🛡️ *Permission Required*\n\n` +
        `${emoji} *Tool:* \`${req.toolName}\`\n` +
        `📦 *Args:* \`${argStr}\`\n\n` +
        `Allow this action?`, 
        { 
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[
              { text: "✅ Allow", callback_data: `perm_approve:${req.toolName}` },
              { text: "❌ Deny",  callback_data: `perm_reject:${req.toolName}` },
            ]],
          },
        }
      );
    });

    this.agent.on("error", async (e: Error) => {
      await this.sendText(`❌ *Error:* ${e.message}`);
    });
    this.agent.on("agentError", async (e: Error) => {
      await this.sendText(`❌ *Error:* ${e.message}`);
    });

    this.agent.on("done", async () => {
      if (this.doneHandled) return; // Prevent double handling
      this.doneHandled = true;
      // Guard: jangan seal kalau buffer kosong (hindari double-seal)
      if (!this.responseBuffer.trim() && !this.currentResponseMsgId) return;
      await this.sealResponse();
    });
  }

  private async sealResponse() {
    // Guard: debounce seal — jangan seal 2x dalam 200ms
    const now = Date.now();
    if (now - this.lastSealTime < 200) return;
    this.lastSealTime = now;

    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
    
    // Wait for any ongoing flush to finish (max 2 seconds)
    for (let i = 0; i < 20; i++) {
      if (!this.isFlushing) break;
      await new Promise(r => setTimeout(r, 100));
    }
    
    await this.flushResponse(true);
    this.currentResponseMsgId = null;
    this.responseBuffer = "";
    this.lastFlushedText = "";
  }

  private async sendText(text: string): Promise<void> {
    if (!this.currentChatId || !text.trim()) return;
    const chunks = this.chunkText(text, 4000);
    for (const chunk of chunks) {
      try {
        await this.bot.api.sendMessage(this.currentChatId, chunk, { parse_mode: "Markdown" });
      } catch {
        try { await this.bot.api.sendMessage(this.currentChatId, chunk); } catch {}
      }
      if (chunks.length > 1) await new Promise(r => setTimeout(r, 150));
    }
  }

  private async sendScreenshot(filePath: string): Promise<void> {
    if (!this.currentChatId) return;
    try {
      const { readFile } = await import("node:fs/promises");
      const buffer = await readFile(filePath);
      await this.bot.api.sendPhoto(this.currentChatId, new InputFile(buffer, `screenshot-${Date.now()}.png`));
    } catch (e: any) {
      await this.sendText(`❌ Failed to send screenshot: ${e.message}`);
    }
  }

  async sendFileToChat(filePath: string, caption?: string): Promise<void> {
    if (!this.currentChatId) throw new Error("No active Telegram chat");
    const pathMod = await import("path");
    const { readFile } = await import("node:fs/promises");
    const resolved = resolveSafePath(filePath);
    const buffer = await readFile(resolved);
    const filename = pathMod.default.basename(resolved);
    const ext = pathMod.default.extname(resolved).toLowerCase();
    if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) {
      await this.bot.api.sendPhoto(this.currentChatId, new InputFile(buffer, filename), { caption: caption || undefined });
    } else {
      await this.bot.api.sendDocument(this.currentChatId, new InputFile(buffer, filename), { caption: caption || undefined });
    }
  }

  private chunkText(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];
    const chunks: string[] = [];
    let rem = text;
    while (rem.length > 0) {
      let cut = maxLen;
      const nl = rem.lastIndexOf("\n", maxLen);
      if (nl > maxLen * 0.6) cut = nl + 1;
      chunks.push(rem.slice(0, cut));
      rem = rem.slice(cut);
    }
    return chunks;
  }

  async start(): Promise<void> {
    await this.registerTelegramTools();
    try {
      await this.bot.api.sendMessage(this.config.allowedChatId, `🟢 *Hiru online*\n\`${this.ctx.root}\`\nSend any command — /help for assistance.`, { parse_mode: "Markdown" });
    } catch {}
    await this.bot.start({ onStart: () => {} });
  }

  async stop(): Promise<void> {
    try {
      await this.bot.api.sendMessage(this.config.allowedChatId, "🔴 *Hiru offline.*", { parse_mode: "Markdown" });
    } catch {}
    await this.bot.stop();
  }
}
