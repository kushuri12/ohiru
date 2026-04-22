import { Message } from "../types.js";
import { createProviderInstance, checkOllamaConnection } from "../providers/index.js";
import { v4 as uuidv4 } from "uuid";
import { HiruConfig, ProjectContext } from "shared";
import { internalTools, setFileProgressCallback, toolEvents } from "../tools/index.js";
import { streamText, stepCountIs, ToolCallPart, ToolResultPart, generateText } from "ai";
import { EventEmitter } from "events";
import path from "path";
import fs from "fs";
import { MemoryGuard } from "../memory/guard/MemoryGuard.js";
import { CheckpointManager } from "../memory/guard/CheckpointManager.js";
import { LoopDetector } from "../memory/guard/LoopDetector.js";
import { ToolSandbox } from "../memory/guard/ToolSandbox.js";
import chalk from "chalk";
import { c, ORANGE } from "../ui/theme.js";

import ora from "ora";
import os from "os";
import { fileURLToPath } from "url";
import { 
  ThinkingController, 
  ThinkingMode, 
  ParsedPlan,
  PlanParser
} from "../thinking/index.js";
import { StreamingTagFilter, TagStripper } from "../thinking/TagStripper.js";
import { SectionParser, ParsedSection } from "../thinking/SectionParser.js";
import { 
  PLANNING_SYSTEM_PROMPT, 
  EXECUTION_SYSTEM_PROMPT, 
  CHAT_SYSTEM_PROMPT 
} from "./prompts.js";
import { buildSystemPrompt, buildSystemPromptParts, ContextBuilder, PromptPart, ContextBuilderOptions } from "./ContextBuilder.js";
import { TodoTracker, TodoItem } from "./TodoTracker.js";
import { SkillManager, createSkillTools } from "../skills/index.js";
import { GlobalMemory, createMemoryTools } from "../memory/index.js";
import { FileProgressEvent, globalFileProgress } from "../tools/FileProgress.js";
import { createAgentTool } from "../tools/AgentTool.js";
import { Compactor } from "./Compactor.js";
import { StepVerifier } from "./StepVerifier.js";
import { ProjectSnapshot } from "./Snapshot.js";
import { NoOpHandler } from "./NoOpHandler.js";
import { PlanEnforcer } from "./PlanEnforcer.js";
import { PluginManager, createPluginTools } from "../plugins/index.js";
import {
  getKitTools,
  applyTieredCompression,
  trimToolDescriptions,
  MINIMAL_SYSTEM_PROMPT,
  ToolKitName,
  classifyTask,
  TaskCategory,
} from "./SmartContext.js";
import { HeartbeatManager } from "./Heartbeat.js";
import { GlobalIntelligence } from "./GlobalIntelligence.js";
import { SkillVersionManager } from "../skills/SkillVersionManager.js";
import { TokenBudget } from "./TokenBudget.js";
import { OpenHiruMDRouter } from "../memory/HiruMDRouter.js";
import { ToolResultCache } from "../tools/ToolResultCache.js";
import { ConfidenceChecker } from "./ConfidenceChecker.js";
import { ErrorPatternLibrary } from "../tools/ErrorHandler.js";
import { getProjectMemoryPath } from "../utils/paths.js";

export class HiruAgent extends EventEmitter {
  private model: any;
  private currentTaskCategory: TaskCategory = "full"; 
  private activeKits = new Set<ToolKitName>(["core"]);
  public config: HiruConfig;
  public messages: any[] = [];
  private maxIterations = 50;
  private currentAbortController: AbortController | null = null;

  public tokenUsage = { prompt: 0, completion: 0 };

  private static readonly MAX_MESSAGES = 60;
  private static readonly MESSAGES_TAIL_SIZE = 30;

  private memoryGuard: MemoryGuard;
  private checkpointManager: CheckpointManager;
  private loopDetector: LoopDetector;
  private sandbox: ToolSandbox;

  private currentStepIndex = 0;
  private trackedSteps: any[] = []

  private noOpHandler: NoOpHandler;
  private planEnforcer: PlanEnforcer;

  private thinkingController: ThinkingController;
  private todoTracker: TodoTracker;
  public skillManager: SkillManager;
  private libraryManager: SkillManager | null = null;
  public pluginManager: PluginManager;
  private globalMemory: GlobalMemory;
  private skillsReady = false;

  private xmlToolCallCount = 0;
  private realToolCallCount = 0;
  private compactor: Compactor;
  private activeSnapshot: string = "";

  private boundFileProgressHandler: ((event: FileProgressEvent) => void) | null = null;
  private adaptedMessagesCache: { hash: string; result: any[] } | null = null;
  private lastThinkingEmit = 0;
  private readonly THINKING_EMIT_INTERVAL = 150;
  private activeToolCalls = new Map<string, { name: string; args: any }>();
  private ctx!: ProjectContext; 
  private readyPromise: Promise<void>;
  private tools: Record<string, any> = {}; 

  private heartbeat: HeartbeatManager | null = null;
  private intelligence: GlobalIntelligence | null = null;
  
  // Intelligence Upgrades v2
  private tokenBudget: TokenBudget;
  private memoryRouter: OpenHiruMDRouter;
  private resultCache: ToolResultCache;
  private confidenceChecker: ConfidenceChecker;
  private errorLibrary: ErrorPatternLibrary;

  public async waitReady() {
    return this.readyPromise;
  }

  constructor(config: HiruConfig, sessionId?: string) {
    super();
    this.on("error", () => {}); // fallback — prevent uncaught EventEmitter crash
    this.config = config;
    this.model = createProviderInstance(config);
    this.sandbox = new ToolSandbox();
    this.loopDetector = new LoopDetector();
    this.checkpointManager = new CheckpointManager(sessionId);
    this.todoTracker = new TodoTracker();
    this.skillManager = new SkillManager();
    this.pluginManager = new PluginManager();
    this.globalMemory = new GlobalMemory();
    this.noOpHandler = new NoOpHandler();
    this.planEnforcer = new PlanEnforcer();
    
    // Intelligence Upgrades v2
    this.tokenBudget = new TokenBudget(config.model);
    this.memoryRouter = new OpenHiruMDRouter(getProjectMemoryPath(process.cwd()));
    this.resultCache = new ToolResultCache(30000);
    this.confidenceChecker = new ConfidenceChecker();
    this.errorLibrary = new ErrorPatternLibrary();
    
    // Proactive Intelligence
    this.intelligence = new GlobalIntelligence(this, {} as any); // Context updated in waitReady

    // Init async stuff
    this.readyPromise = (async () => {
      try {
        await Promise.all([
          this.skillManager.init(),
          this.pluginManager.init(),
          this.globalMemory.init()
        ]);
        
        this.skillsReady = true;
        
        // 0. Initialize local tools with internal tools
        this.tools = { ...internalTools };

        // 0.1 Register the Toolkit Opener — This is a CORE tool
        this.tools["open_toolkit"] = {
          description: "Opens a specialized toolkit (web, desktop, or specialist) to access more advanced tools. Use this when your current 'core' tools are insufficient. Examples: 'web' for searching/browsing, 'desktop' for screenshots/mouse, 'specialist' for managing skills/plugins.",
          parameters: {
            type: "object",
            properties: {
              kitName: {
                type: "string",
                enum: ["web", "desktop", "specialist"],
                description: "The name of the toolkit to open."
              }
            },
            required: ["kitName"]
          },
          execute: async ({ kitName }: { kitName: ToolKitName }) => {
            // Exclusive Kit logic: Clear all non-core kits before adding the new one
            this.activeKits.clear();
            this.activeKits.add("core");
            this.activeKits.add(kitName);

            const statusMsg = `✅ Toolkit '${kitName}' loaded. Any previously opened specialized kits have been closed to save tokens. You now have access to ${kitName}-specific tools.`;
            this.emit("status", `Switched to ${kitName} toolkit`);
            return statusMsg;
          }
        };

        // 1. Register memory tool
        const memoryTools = createMemoryTools(this.globalMemory);
        Object.assign(this.tools, memoryTools);

        // 2. Register plugin management tool + plugin-provided tools
        const pluginTools = createPluginTools(this.pluginManager);
        Object.assign(this.tools, pluginTools);
        Object.assign(this.tools, this.pluginManager.getToolDefinitions());

        // 3.5. Load Built-in Skills from Library (The "Hundreds of Files" update)
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const libraryDir = path.resolve(__dirname, "..", "skills", "library");
        
        if (fs.existsSync(libraryDir)) {
           const versionManager = new SkillVersionManager(libraryDir);
           await versionManager.pruneOldVersions(false); // Auto-clean old versions
           
           this.libraryManager = new SkillManager(libraryDir);
           await this.libraryManager.init(); // This now uses versioning inside
           
           Object.assign(this.tools, this.libraryManager.getToolDefinitions());
           console.log(`  ${c.green("⚡")}  ${c.muted("Library loaded  ")}${chalk.white(this.libraryManager.listSkills().length + " high-tier skills")}`);
        }

        // 3.6. Finalize Skill Tools with Library Awareness
        const skillTools = createSkillTools(this.skillManager, this.libraryManager || undefined);
        Object.assign(this.tools, skillTools);
        Object.assign(this.tools, this.skillManager.getToolDefinitions());

        // 4. RECURSIVE AGENT TOOL (Premium Design)
        const hiruSubagentTool = createAgentTool(
          (cfg) => new HiruAgent(cfg, "sub-session"), 
          this.config, 
          () => this.ctx // Return the current context at call-time
        );
        this.tools["openhiru"] = hiruSubagentTool;

        // Re-register when skills change
        this.skillManager.on("skillCreated", () => {
          Object.assign(this.tools, this.skillManager.getToolDefinitions());
        });
        this.skillManager.on("skillUpdated", () => {
          Object.assign(this.tools, this.skillManager.getToolDefinitions());
        });
        this.skillManager.on("skillDeleted", (name: string) => {
          delete this.tools[`skill_${name}`];
        });

        // Re-register when plugins change (hot-reload)
        this.pluginManager.on("pluginInstalled", () => {
          Object.assign(this.tools, this.pluginManager.getToolDefinitions());
        });
        this.pluginManager.on("pluginUninstalled", () => {
          // Rebuild tools — remove stale plugin tools
          const currentPluginTools = this.pluginManager.getToolDefinitions();
          for (const key of Object.keys(this.tools)) {
            if (key.startsWith("plugin_") && !currentPluginTools[key]) {
              delete this.tools[key];
            }
          }
        });
        this.pluginManager.on("pluginEnabled", () => {
          Object.assign(this.tools, this.pluginManager.getToolDefinitions());
        });
        this.pluginManager.on("pluginDisabled", () => {
          const currentPluginTools = this.pluginManager.getToolDefinitions();
          for (const key of Object.keys(this.tools)) {
            if (key.startsWith("plugin_") && !currentPluginTools[key]) {
              delete this.tools[key];
            }
          }
        });

        // 5. Ollama health check & auto-pull
        if (this.config.provider === "ollama") {
          const { checkOllamaConnection, ensureOllamaModel } = await import("../providers/index.js");
          const connErr = await checkOllamaConnection(this.config.baseUrl);
          if (!connErr) {
            await ensureOllamaModel(this.config.baseUrl, this.config.model, (msg) => {
              this.emit("status", msg.replace(/\*/g, ""));
              console.log(`[Ollama] ${msg.replace(/\*/g, "")}`);
            }).catch(err => console.error(`[Ollama Error] ${err.message}`));
          }
        }
      } catch (e: any) {
        console.error(`  ${c.red("✗")}  ${c.muted("System init     ")}${chalk.red(e.message)}`);
      }
    })();

    // Setup Thinking Controller
    this.thinkingController = new ThinkingController({
      mode: (config.thinkingMode as ThinkingMode) || "compact",
      requirePlanApproval: config.planMode === true, // Default to false
      autoApproveReadOnly: true, // Always auto-approve read-only
      showRawThinking: config.thinkingMode === "verbose",
    });

    // Forward thinking events
    this.attachThinkingListeners();

    // Setup Memory Guard
    const limit = config.maxMemoryMB || 4096;
    this.memoryGuard = new MemoryGuard({
      warnMB: Math.floor(limit * 0.7),
      gcMB: Math.floor(limit * 0.8),
      emergencyMB: Math.floor(limit * 0.9),
      criticalMB: Math.floor(limit * 0.95)
    });
    this.memoryGuard.on("warn", (s) => this.emit("memory_warn", s));
    this.memoryGuard.on("pressure", (s) => this.emit("memory_pressure", s));
    this.memoryGuard.on("emergency", (s) => this.emit("memory_emergency", s));
    this.memoryGuard.on("critical", (s) => {
      this.emit("memory_critical", s);
      if (this.currentAbortController) {
        this.currentAbortController.abort();
      }
      this.emit("agentError", new Error("Critical memory limit reached. Execution aborted to prevent crash."));
    });
    this.memoryGuard.start();

    // Setup File Progress Listener
    this.boundFileProgressHandler = (event: FileProgressEvent) => {
      this.emit("fileProgress", event);
    };
    globalFileProgress.on("fileProgress", this.boundFileProgressHandler);

    // Setup Shell Output Listener
    this.boundShellOutputHandler = (data: { text: string }) => {
      this.emit("toolOutput", data);
    };
    toolEvents.on("shell-output", this.boundShellOutputHandler);
  }

  private boundShellOutputHandler: ((data: { text: string }) => void) | null = null;

  /**
   * Abort the current request/run (planning or execution)
   */
  public abortCurrentRun() {
    if (this.currentAbortController) {
      this.currentAbortController.abort(new Error("User interrupted execution"));
      this.currentAbortController = null;
    }
  }

  private initSteps(plan: ParsedPlan) {
    this.currentStepIndex = 0;
    this.trackedSteps = plan.steps.map(s => ({
      step: s,
      status: "pending" as const,
      toolCallsMade: 0
    }));
    
    // Reset and populate todoTracker with planned steps
    this.todoTracker.reset();
    plan.steps.forEach(s => {
      this.todoTracker.add(`step-${s.number}`, s.verb, s.target, "pending");
    });

    this.emit("stepsInit", [...this.trackedSteps]);
    this.emit("todoUpdate", this.todoTracker.getAll());
  }

  private updateStep(idx: number, patch: any) {
    if (!this.trackedSteps[idx]) return;
    this.trackedSteps[idx] = { ...this.trackedSteps[idx], ...patch };
    this.emit("stepUpdate", { index: idx, step: this.trackedSteps[idx] });
  }

  getTools(options: { isReadonly?: boolean } = {}) {
    const wrappedTools: any = {};
    
    // 1. Core Internal & Instance Tools
    for (const [name, tool] of Object.entries(this.tools)) {
      const t = tool as any;
      
      // Note: Write filtering was removed to ensure full capability awareness in all modes.
      // Permission checks still happen in the execute() method below.
      if (options.isReadonly) {
          // No-op: we now keep all tool definitions even in planning/read-only mode 
          // to ensure the LLM doesn't have "capability amnesia".
      }

      wrappedTools[name] = {
        description: t.description,
        parameters: t.parameters,
        execute: async (args: any) => {
          let needsPerm = false;
          if (typeof t.requiresPermission === "function") {
            needsPerm = t.requiresPermission(args);
          } else if (t.requiresPermission === true) {
            needsPerm = true;
          }

          if (needsPerm) {
            // Permission check removed per user request. 
            // The agent is now trusted to execute tools directly.
            // console.log(`  🛡️  Auto-approving ${name}`);
          }

          // Check Cache
          const cached = this.resultCache.get(name, args);
          if (cached) {
            console.log(`  ${c.glow("●")}  ${c.muted("Memory recall   ")}${c.light(name)}`);
            return cached;
          }

          const result = await t.execute(args);
          
          // Store in cache
          this.resultCache.set(name, args, result);
          
          return result;
        }
      };
    }

    return wrappedTools;
  }

  private getSmartTools(options: { isReadonly?: boolean; input?: string } = {}): Record<string, any> {
    const allTools = this.getTools(options);
    
    // Toolkit-based selection for maximum token efficiency
    const kitTools = getKitTools(allTools, this.activeKits);
    
    // Trim tool descriptions to max 400 chars for additional savings
    return trimToolDescriptions(kitTools);
  }

  /**
   * Helper to get system prompt with cache control hints
   */
  private async getSystemPrompt(ctx: ProjectContext, wrapper?: (p: string) => string, input?: string): Promise<any> {
    // Modular Soul Injection (OpenClaw style)
    const modularSoul: any = {};
    try {
       // 1. Check PROJECT LOCAL paths
       const localSoul = path.join(ctx.root, "SOUL.md");
       const localId = path.join(ctx.root, "IDENTITY.md");
       const localUser = path.join(ctx.root, "USER.md");
       
       // 2. Check GLOBAL paths (~/.openhiru/)
       const globalSoul = path.join(os.homedir(), ".openhiru", "SOUL.md");
       const globalId = path.join(os.homedir(), ".openhiru", "IDENTITY.md");
       const globalUser = path.join(os.homedir(), ".openhiru", "USER.md");
       
       if (fs.existsSync(localSoul)) modularSoul.soul = fs.readFileSync(localSoul, "utf-8");
       else if (fs.existsSync(globalSoul)) modularSoul.soul = fs.readFileSync(globalSoul, "utf-8");
       
       if (fs.existsSync(localId)) modularSoul.identity = fs.readFileSync(localId, "utf-8");
       else if (fs.existsSync(globalId)) modularSoul.identity = fs.readFileSync(globalId, "utf-8");
       
       if (fs.existsSync(localUser)) modularSoul.user = fs.readFileSync(localUser, "utf-8");
       else if (fs.existsSync(globalUser)) modularSoul.user = fs.readFileSync(globalUser, "utf-8");
    } catch (e) {
       // Ignore FS errors in prompt builder
    }

    // Smart conditional injection — only include sections when relevant
    const contextOptions: ContextBuilderOptions = {
      hasDesktopTools: !!(this.tools["take_screenshot"] || this.tools["move_mouse"] || this.tools["inspect_ui"]),
      isTelegram: !!(this.config as any).telegramMode,
      userInput: input,
    };

    // Combined skills for prompt
    const skillListProvider = {
      listSkills: () => [
        ...this.skillManager.listSkills(),
        ...(this.libraryManager ? this.libraryManager.listSkills() : [])
      ]
    };

    // Get smart-selected tools for this task category
    const activeTools = this.getSmartTools({ isReadonly: this.currentTaskCategory === "chat" });

    const parts = buildSystemPromptParts(
      ctx, 
      this.globalMemory, 
      skillListProvider, 
      this.activeSnapshot, 
      modularSoul, 
      this.pluginManager, 
      contextOptions,
      activeTools
    );
    
    // Intelligence Upgrades v2: Append routed memory
    const memoryContext = await this.memoryRouter.getRelevantContext(this.currentTaskCategory);
    if (memoryContext) {
      parts.push({ text: memoryContext, cacheControl: { type: "ephemeral" } });
    }

    // If we have a wrapper (like PLANNING_SYSTEM_PROMPT), we must apply it.
    // However, some providers prefer arrays for caching.
    // Default to string for all providers (AI SDK system property expects a string or SystemModelMessage)
    const fullPrompt = parts.map(p => p.text).join("\n");
    const wrapped = wrapper ? wrapper(fullPrompt) : fullPrompt;
    return wrapped;
  }
  
  /**
   * Semi-minimal system prompt for chat — keeps core identity and skills
   * but removes all the planning/execution/rules scaffold.
   * Saves ~80% tokens vs full prompt.
   */
  private async getMinimalSystemPrompt(ctx: ProjectContext): Promise<string> {
    const skillListProvider = {
      listSkills: () => [
        ...this.skillManager.listSkills(),
        ...(this.libraryManager ? this.libraryManager.listSkills() : [])
      ]
    };
    
    return new ContextBuilder(ctx, this.globalMemory, skillListProvider)
      .addCoreInstructions()
      .addCapabilities()
      .addStandardHeader()
      .build();
  }

  updateConfig(config: HiruConfig) {
    this.config = config;
    this.model = createProviderInstance(config);
    this.thinkingController.updateConfig({
      mode: (config.thinkingMode as ThinkingMode) || "compact",
      requirePlanApproval: config.planMode === true,
      autoApproveReadOnly: true,
    });
  }

  private adaptMessages(messages: any[]): any[] {
    // Build a robust hash that captures message count, last ID, AND last content signature
    // This prevents stale cache when messages are mutated in-place (e.g., by trimMessages)
    const lastMsg = messages[messages.length - 1];
    const lastContent = lastMsg?.content;
    const contentSig = typeof lastContent === "string" 
      ? lastContent.length.toString() 
      : Array.isArray(lastContent) 
        ? `arr_${lastContent.length}` 
        : "empty";
    const hash = `${messages.length}_${lastMsg?.id || "none"}_${contentSig}_${messages.length > 1 ? messages[messages.length - 2]?.id || "" : ""}`;
    if (this.adaptedMessagesCache?.hash === hash) {
      return this.adaptedMessagesCache.result;
    }
    const result = this.computeAdaptedMessages(messages);
    this.adaptedMessagesCache = { hash, result };
    return result;
  }

  /**
   * Helper to get a content fingerprint for dedup checks.
   */
  private contentFingerprint(content: any): string {
    if (typeof content === "string") return content.slice(0, 500);
    if (Array.isArray(content)) {
      return content.map((c: any) => {
        if (typeof c === "string") return c.slice(0, 200);
        if (c?.type === "text") return (c.text || "").slice(0, 200);
        if (c?.type === "tool-call") return `tc:${c.toolName}:${c.toolCallId}`;
        if (c?.type === "tool-result") return `tr:${c.toolCallId}`;
        return JSON.stringify(c).slice(0, 100);
      }).join("|");
    }
    return JSON.stringify(content || "").slice(0, 500);
  }

  private computeAdaptedMessages(messages: any[]): any[] {
    const raw: any[] = [];
    const MAX_SHRED = 4000; // Reduced from 8000 — aggressive compression for token savings
    // Track seen content fingerprints to prevent exact duplicates from entering the adapted array
    const seenFingerprints = new Set<string>();

    for (let i = 0; i < messages.length; i++) {
      const msg = { ...messages[i] };
      const isLast = i === messages.length - 1;

      try {
        if (!isLast && typeof msg.content === "string" && msg.content.length > MAX_SHRED) {
          msg.content = msg.content.slice(0, MAX_SHRED) + "\n[...content shredded for speed]";
        }

        if (msg.role === "user" || msg.role === "assistant") {
          if (!msg.content && !Array.isArray(msg.content)) continue;
          
          // Dedup: skip if we've seen an identical message from the same role recently
          // EXCEPT if it contains tool calls (important for AI SDK sequence)
          const hasToolCalls = Array.isArray(msg.content) && msg.content.some((c: any) => c.type === "tool-call");
          const fp = `${msg.role}:${this.contentFingerprint(msg.content)}`;
          if (seenFingerprints.has(fp) && !isLast && !hasToolCalls) {
            continue; // Skip duplicate
          }
          seenFingerprints.add(fp);
          raw.push(msg); 
        } else if (msg.role === "tool" || msg.role === "tool_result") {
          // Keep tool results as they are if they are already in the array format
          if (Array.isArray(msg.content)) {
            raw.push(msg);
          } else {
            const MAX_TOOL_SHRED = 15000;
            const content = (msg as any).content || (msg as any).result || "";
            let finalContent = content;
            if (!isLast && typeof content === "string" && content.length > MAX_TOOL_SHRED) {
                finalContent = content.slice(0, MAX_TOOL_SHRED) + "... [Result shredded for speed]";
            }
            raw.push({ role: "tool", content: finalContent, toolCallId: (msg as any).toolCallId || (msg as any).id });
          }
        } else if (msg.role === "system") {
          raw.push({ role: "user", content: `[System]: ${msg.content}` });
        }
      } catch (e) {
        console.error("adaptMessages error", e);
      }
    }

    const fixed: any[] = [];
    for (let i = 0; i < raw.length; i++) {
      const msg = raw[i];
      const prev = fixed.length > 0 ? fixed[fixed.length - 1] : null;

      if (msg.role === "tool" && (!prev || prev.role === "user")) {
        continue;
      }

      if (msg.role === "user" && prev?.role === "tool") {
        fixed.push({ role: "assistant", content: "Understood. Continuing." });
      }

      if (prev && msg.role === prev.role && msg.role !== "tool") {
        const isPrevArray = Array.isArray(prev.content);
        const isCurArray = Array.isArray(msg.content);

        if (!isPrevArray && !isCurArray) {
          // CRITICAL FIX: Don't merge if the content is the same (prevents doubled output)
          const prevStr = typeof prev.content === "string" ? prev.content : "";
          const curStr = typeof msg.content === "string" ? msg.content : "";
          if (prevStr === curStr || prevStr.endsWith(curStr) || curStr.endsWith(prevStr)) {
            // Skip — duplicate or subset content
            continue;
          }
          prev.content = `${prev.content}\n\n${msg.content}`;
        } else {
          const prevArr = isPrevArray ? prev.content : [{ type: "text", text: prev.content }];
          const curArr = isCurArray ? msg.content : [{ type: "text", text: msg.content }];
          prev.content = [...prevArr, ...curArr];
        }
        continue;
      }

      fixed.push({ ...msg });
    }

    if (fixed.length > 0) {
      const last = fixed[fixed.length - 1];
      const hasToolCalls = Array.isArray(last.content) && last.content.some((c: any) => c.type === "tool-call");
      
      if (last.role === "assistant" && !hasToolCalls) {
        fixed.push({ role: "user", content: "Please continue." });
      }
    }

    return fixed;
  }
  /**
   * Sanitizes message history after restoration to prevent ERR_MISSING_TOOL_RESULTS.
   * Scans for assistant messages with tool calls and ensures they are followed by results.
   * If results are missing, it strips the tool calls from the assistant message.
   */
  public sanitizeMessages(): void {
    if (!this.messages || this.messages.length === 0) return;

    const cleaned: any[] = [];
    const toolCallRegistry = new Set<string>();

    // Pass 1: Build a list of all tool results we have
    for (const msg of this.messages) {
      if (msg.role === "tool" || msg.role === "tool_result") {
        if (msg.toolCallId) toolCallRegistry.add(msg.toolCallId);
        if (Array.isArray(msg.content)) {
          msg.content.forEach((part: any) => {
            if (part.type === "tool-result" && part.toolCallId) {
              toolCallRegistry.add(part.toolCallId);
            }
          });
        }
      }
    }

    // Pass 2: Clean assistant messages that have no matching results
    for (const msg of this.messages) {
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        const originalContent = msg.content;
        const newContent = originalContent.filter((part: any) => {
          if (part.type === "tool-call") {
            const hasResult = toolCallRegistry.has(part.toolCallId);
            return hasResult;
          }
          return true;
        });

        // If all tool calls were removed but it was ONLY tool calls, 
        // we must avoid leaving an empty message.
        if (newContent.length === 0) {
          cleaned.push({ ...msg, content: "Continuing from internal checkpoint." });
        } else {
          cleaned.push({ ...msg, content: newContent });
        }
      } else {
        cleaned.push(msg);
      }
    }

    this.messages = cleaned;
    this.adaptedMessagesCache = null;
  }
  cleanup(): void {
    if (this.memoryGuard) this.memoryGuard.stop();
    if (this.boundFileProgressHandler) {
      globalFileProgress.off("fileProgress", this.boundFileProgressHandler);
      this.boundFileProgressHandler = null;
    }
    if (this.boundShellOutputHandler) {
      toolEvents.off("shell-output", this.boundShellOutputHandler);
      this.boundShellOutputHandler = null;
    }
    this.messages = [];
    this.trackedSteps = [];
    this.activeKits = new Set<ToolKitName>(["core"]);
    this.currentAbortController = null;
    this.attachThinkingListeners();
    if (this.checkpointManager) {
      this.checkpointManager.close();
    }
    this.todoTracker.reset();
    this.noOpHandler.reset();
    this.planEnforcer.reset();
    if (this.skillManager) this.skillManager.removeAllListeners();
    if (this.pluginManager) this.pluginManager.removeAllListeners();
    this.adaptedMessagesCache = null; 
    this.activeToolCalls.clear();
  }

  private attachThinkingListeners(): void {
    this.thinkingController.removeAllListeners(); // reset dulu
    this.thinkingController.on("thinkingBlock", () =>
      this.emit("thinkingBlock", this.thinkingController.getDisplayState())
    );
    this.thinkingController.on("planReady", (plan) =>
      this.emit("planReady", plan)
    );
    this.thinkingController.on("toolCallDuringThinking", (info) =>
      this.emit("toolCallDuringThinking", info)
    );
  }

  private trimMessages() {
    const MAX_KEEP = 20;   // Further reduced for token efficiency
    const COMPRESS_AGE = 5; // Start tiered compression after 5 messages

    // Apply tiered compression: HOT (last 3) = full, WARM (4-8) = 800 chars, COLD (9+) = 200 chars
    if (this.messages.length > COMPRESS_AGE) {
      this.messages = applyTieredCompression(this.messages);
    }

    // Hard cap on total message count
    if (this.messages.length > MAX_KEEP) {
      const initialContext = this.messages.slice(0, 2); // Keep first 2 messages (original user intent)
      const rest = this.messages.slice(-(MAX_KEEP - 2));
      this.messages = [...initialContext, ...rest];
    }
    this.adaptedMessagesCache = null;
  }

  private createAbortSignal(timeoutMs: number): AbortSignal {
    const controller = new AbortController();
    this.currentAbortController = controller;
    
    // Manual timeout for broader Node.js version support and reliability
    const timer = setTimeout(() => {
      controller.abort(new Error(`System timeout after ${timeoutMs / 1000}s. Please try a faster model or check your network.`));
    }, timeoutMs);

    // Ensure the timer doesn't keep the process alive
    timer.unref?.();

    // Clear timer if controller already aborted via other means
    controller.signal.addEventListener("abort", () => clearTimeout(timer));

    return controller.signal;
  }
  async runStreaming(input: string | any[], ctx: ProjectContext): Promise<void> {
    try {
      // ── Ollama pre-flight: verify the local server is actually up ──────
      if (this.config.provider === "ollama") {
        const connErr = await checkOllamaConnection(this.config.baseUrl);
        if (connErr) {
          this.emit("agentError", new Error(connErr));
          return;
        }
      }

      const MAX_RUN_RETRIES = 2;
      let runAttempt = 0;

      while (runAttempt < MAX_RUN_RETRIES) {
        try {
          await this.executeRunFlow(input, ctx);
          break; // Success!
        } catch (e: any) {
          runAttempt++;

          // ── Friendly Ollama connection error ──────────────────────────
          const isOllamaConnErr =
            e?.name === "_OllamaError" ||
            (e?.cause?.code === "ECONNREFUSED") ||
            (e?.cause?.cause?.code === "ECONNREFUSED") ||
            (e?.message?.includes("fetch failed") && this.config.provider === "ollama");

          if (isOllamaConnErr) {
            const friendly = new Error(
              `Ollama disconnected mid-session.\n` +
              `  → Restart Ollama: ollama serve\n` +
              `  → Then try your request again.`
            );
            this.emit("agentError", friendly);
            break;
          }

          const isRetryable = e.name === "AI_RetryError" || e.statusCode === 429 || e.statusCode === 503 || e.message?.includes("rate limit");
          
          if (isRetryable && runAttempt < MAX_RUN_RETRIES) {
            this.emit("status", `⚠️ Rate limited. Swapping lungs... (Retry ${runAttempt}/${MAX_RUN_RETRIES})`);
            await new Promise(r => setTimeout(r, 2000 * runAttempt)); // Exponential wait
            continue;
          }
          
          this.emit("error", e);
          break;
        }
      }
    } finally {
      this.emit("done", ""); 
    }
  }

  private async executeRunFlow(input: string | any[], ctx: ProjectContext) {
      this.ctx = ctx; // Capture context for subagents
      
      if (this.messages.length === 0) {
        this.cleanup();
      }
      this.loopDetector.reset();
      this.noOpHandler.reset();

      if (input) {
        if (typeof input === "string" && input.trim()) {
           this.messages.push({ id: uuidv4(), role: "user" as const, content: input });
        } else if (Array.isArray(input)) {
           this.messages.push({ id: uuidv4(), role: "user" as const, content: input });
        }
      }

      // Classify task BEFORE any LLM call — determines tool selection for entire turn
      this.currentTaskCategory = typeof input === "string" ? classifyTask(input) : "full";

      // PRE-FLIGHT TOKEN BUDGET CHECK
      const inputStr = typeof input === "string" ? input.trim() : "";
      const systemPrompt = await this.getSystemPrompt(ctx, PLANNING_SYSTEM_PROMPT, inputStr);
      const budget = this.tokenBudget.check(
        typeof systemPrompt === "string" ? systemPrompt : JSON.stringify(systemPrompt),
        this.getSmartTools({ isReadonly: true, input: inputStr }),
        this.messages
      );
      
      this.emit("status", this.tokenBudget.formatStatus(budget));
      
      if (budget.action === "compress" || budget.action === "hard_limit") {
        this.emit("status", "⚡ Context budget exceeded. Compacting memory...");
        await this.compactor.compact(this.messages);
      }

      // Minimalist greeting filter - Only for extremely short greetings to keep response time low.
      // For everything else, let the LLM's brain decide (Planning Phase).
      const shortGreetings = /^(halo|hello|hi|p|pagi|siang|sore|malam|oi|hey|openhiru)$/i;
      const isShortGreeting = inputStr && shortGreetings.test(inputStr) && inputStr.split(/\s+/).length < 3;
      
      // Conversational query detector — informational/chat queries that do not require an execution plan.
      // Example: "what features do you have", "what can you do", "explain how you work"
      const isConversationalQuery = !isShortGreeting && inputStr && (() => {
        const lower = inputStr.toLowerCase();
        const wordCount = inputStr.split(/\s+/).length;
        
        // Informational question patterns
        const questionPatterns = /^(apa|siapa|kapan|dimana|gimana|bagaimana|berapa|kenapa|mengapa|boleh|bisa|apakah|how|what|who|when|where|why|can you|do you|are you|is there|tell me|explain|describe|list|kamu)/i;
        
        // Action indicators (Not conversational)
        const actionWords = /(buatkan|buat|bikin|create|write|edit|fix|perbaiki|tambahkan|hapus|delete|rename|install|setup|deploy|refactor|implement|ubah|ganti|run|jalankan|update|tolong.*(?:buat|tulis|edit|fix)|cek|cari|carikan|check|search|find|lookup|tampilkan|kasih|ambil|get|fetch|show)/i;
        
        // Explicit "no action" indicators (Strongly conversational)
        const noActionHints = /(gausa|gausah|ga usah|jangan|don't|tanpa|no need|just tell|kasi tau|kasih tau|explain only)/i;
        
        // If there's a "no action" hint -> conversational
        if (noActionHints.test(lower) && !actionWords.test(lower)) return true;
        
        // If short query AND question pattern AND no action word -> conversational
        if (wordCount <= 15 && questionPatterns.test(lower) && !actionWords.test(lower)) return true;
        
        // Very short question without action words
        if (wordCount <= 6 && !actionWords.test(lower) && lower.includes("?")) return true;
        
        return false;
      })();

      if (isShortGreeting || isConversationalQuery) {
         // Fast path for greetings and conversational queries
         // For simple queries: use MINIMAL system prompt (saves ~1000 tokens)
         const useMinimalPrompt = this.currentTaskCategory === "chat" || this.currentTaskCategory === "web";
         const coreMessages = this.adaptMessages(this.messages);
         const chatResult = await streamText({
            model: this.model,
            system: useMinimalPrompt
              ? (await this.getMinimalSystemPrompt(ctx))
              : (await this.getSystemPrompt(ctx, CHAT_SYSTEM_PROMPT, inputStr)),
            messages: coreMessages,
            tools: this.getSmartTools({ isReadonly: true, input: inputStr }), // Smart tool selection
            abortSignal: this.createAbortSignal(30000),
            maxOutputTokens: 1024, // Short answers for chat
            maxRetries: 2
         });

         const tagFilter = TagStripper.createStreamingFilter();
         let hasOutput = false;
         let responseText = "";

         // Heartbeat — detect stall in chat path (same as planning)
         let lastDisplayTime = Date.now();
         const chatHeartbeat = setInterval(() => {
           if (Date.now() - lastDisplayTime > 15_000) {
             // 15s tanpa display token → emit status agar user tau masih jalan
             this.emit("status", "Model is thinking deeply...");
             lastDisplayTime = Date.now(); // reset agar status muncul lagi setiap 15s
           }
         }, 3000);

         try {
           for await (const text of chatResult.textStream) {
              const { display } = tagFilter.feed(text);
              if (display) {
                this.emit("token", display);
                responseText += display;
                hasOutput = true;
                lastDisplayTime = Date.now(); // Reset heartbeat on DISPLAY token, not any token
              }
           }
           
           const flushed = tagFilter.flush();
           if (flushed.display) {
             this.emit("token", flushed.display);
             responseText += flushed.display;
             hasOutput = true;
           }
         } catch (e: any) {
           // Stream error or abort — emit and continue
           if (!hasOutput) {
             this.emit("status", "Retrying response...");
           }
         } finally {
           clearInterval(chatHeartbeat);
         }
         
         if (!hasOutput) {
            this.emit("status", "Hiru is reflecting on response...");
            // Forced retry for empty responses
            try {
              const retryResult = await generateText({
                 model: this.model,
                 system: (await this.getSystemPrompt(ctx, CHAT_SYSTEM_PROMPT, inputStr)) + "\n## MANDATORY: YOUR PREVIOUS RESPONSE HAD NO VISIBLE TEXT. YOU MUST PROVIDE A VISIBLE RESPONSE FOR THE USER NOW. DO NOT JUST THINK.",
                 messages: coreMessages,
                 abortSignal: this.createAbortSignal(15000),
              });
              responseText = TagStripper.strip(retryResult.text || "Hello! How can I assist you today? 🌸");
              this.emit("token", responseText);
            } catch {
              responseText = "Sorry, an error occurred. Please try again.";
              this.emit("token", responseText);
            }
         }

         // Ensure response is always kept in history
         if (responseText.trim()) {
           this.messages.push({ id: uuidv4(), role: "assistant", content: responseText });
           this.trimMessages();
         }
         return;
      }

      const lastMsg = this.messages[this.messages.length - 2];
      const isApproval = typeof input === "string" && /^(y|yes|\/yes|proceed|do it|kerjakan|go|ok|lanjut|sip|yup|gas)$/i.test(input.trim());
      
      if (isApproval && lastMsg && typeof lastMsg.content === "string" && lastMsg.content.includes("</plan>")) {
        const planPart = lastMsg.content.split("<plan>")[1];
        if (planPart) {
          const rawPlan = planPart.split("</plan>")[0];
          const parsedPlan = new PlanParser().parse(rawPlan);
          await this.runExecutionPhase(parsedPlan, ctx);
          return;
        }
      }

      this.ctx = ctx;
      this.emit("status", "Gathering project snapshot...");
      this.activeSnapshot = await ProjectSnapshot.get(ctx);
      
      // Auto-compact if too many messages (trigger sooner for token savings)
      if (this.messages.length > 30) {
        this.emit("status", "Compacting session context...");
        this.messages = await this.compactor.prune(this.messages);
      }

      this.emit("status", "Hiru is thinking...");
      const result = await this.runPlanningPhase(ctx);
      
      if (result.plan) {
        const plan = result.plan;
        const needsApproval = this.thinkingController.needsApproval(plan);
        
        if (needsApproval) {
          const approved = await this.showPlanAndWaitApproval(plan);
          if (!approved) {
            this.emit("planRejected");
            return;
          }
        } else {
          this.emit("planAutoApproved", plan);
        }

        this.emit("status", "Hiru is executing...");
        await this.runExecutionPhase(plan, ctx);
        return;
      }

      if (result.responded) {
        return;
      }

      await this.runExecutionPhase(null, ctx);
  }

  private async runPlanningPhase(ctx: ProjectContext, depth = 0): Promise<{ plan: ParsedPlan | null, responded: boolean }> {
    if (depth > 1) return { plan: null, responded: true };

    this.thinkingController.reset();
    const coreMessages = this.adaptMessages(this.messages);
    const PLANNING_TIMEOUT = this.config.planningTimeoutMs ?? 45_000; // turun dari 3 menit → 45 detik

    let displayBuffer = "";
    let thinkingBuffer = "";
    let planBuffer = "";
    let toolCallsDuringPlanning: Array<{toolName: string, args: any}> = [];
    const tagFilter = TagStripper.createStreamingFilter();

    const result = await streamText({
      model: this.model,
      messages: coreMessages,
      system: await this.getSystemPrompt(ctx, PLANNING_SYSTEM_PROMPT),
      tools: this.getSmartTools({ isReadonly: true }), // Smart selection — saves 3000-5000 tokens on tools
      abortSignal: this.createAbortSignal(PLANNING_TIMEOUT),
      maxRetries: 5,
      maxOutputTokens: 2048, // Plans are short — 2048 is plenty
      onStepFinish: (ev: any) => {
        if (ev.usage) {
          this.tokenUsage.prompt += ev.usage.promptTokens || 0;
          this.tokenUsage.completion += ev.usage.completionTokens || 0;
        }
        const respMsgs = ev.response?.messages || ev.responseMessages;
        if (respMsgs) {
            for (const m of respMsgs) {
              // Robust dedup: check last 5 messages for content match (not just the very last one)
              const fp = this.contentFingerprint(m.content);
              const isDuplicate = this.messages.slice(-5).some(existing => 
                existing.role === m.role && this.contentFingerprint(existing.content) === fp
              );
              
              const hasTools = Array.isArray(m.content) && m.content.some((c: any) => c.type === 'tool-call' || c.type === 'tool-result');
              const isToolMsg = m.role === 'tool' || (m as any).toolCallId;

              if (isDuplicate && !hasTools && !isToolMsg) continue;
              this.messages.push({ ...m, id: uuidv4() });
            }
            this.trimMessages();
        }
      }
    });

    let lastTokenTime = Date.now();
    let lastDisplayTime = Date.now(); // Track display tokens separately from all tokens
    let staledAlerted = false;
    const HEARTBEAT_MS = 20_000; // Hard abort if NO tokens at all for 20s
    let xmlToolCallDetected = false;
    const heartbeat = setInterval(() => {
      const elapsed = Date.now() - lastTokenTime;
      const displayElapsed = Date.now() - lastDisplayTime;

      // User-facing stall alert: no DISPLAY tokens for 10s
      // (model may still be sending thinking tokens invisibly)
      if (displayElapsed > 10_000 && !staledAlerted) {
        staledAlerted = true;
        this.emit("thinkingStalled", { elapsed: 10 });
        this.emit("status", "Model is reasoning deeply...");
      }

      // Hard abort: no tokens AT ALL for 20s (true network stall)
      if (elapsed > HEARTBEAT_MS) {
        this.currentAbortController?.abort(new Error(`Model stalled (${HEARTBEAT_MS/1000}s silence). Check your internet or try a faster model.`));
      }
    }, 5000);

    try {
      for await (const chunk of result.fullStream) {
        lastTokenTime = Date.now(); // Reset on ANY chunk (for network stall detection)
        if (chunk.type === "tool-call") {
          const name = chunk.toolName;
          const args = (chunk as any).args || chunk.input;
          toolCallsDuringPlanning.push({ toolName: name, args });
          this.thinkingController.onToolCallDuringThinking(name, args);
          this.emit("toolCall", { toolName: name, args, toolCallId: chunk.toolCallId });
        }
        if (chunk.type === "text-delta") {
          const { display, thinking, toolCallText, tagType } = tagFilter.feed(chunk.text);
          if (toolCallText.trim() && !xmlToolCallDetected) xmlToolCallDetected = true;
          if (thinking || toolCallText) {
            if (tagType === "plan") {
              planBuffer += thinking || toolCallText;
            } else if (thinking) {
              thinkingBuffer += thinking;
              this.thinkingController.feedToken(thinking);
            }
          }
          if (display) {
            displayBuffer += display;
            lastDisplayTime = Date.now(); // Reset ONLY on visible display tokens
            staledAlerted = false;         // Allow re-alert if it stalls again
            // Emit tokens to UI immediately (Fixed: now conversational replies aren't lost)
            this.emit("token", display); 
          }
          const now = Date.now();
          if (now - this.lastThinkingEmit >= this.THINKING_EMIT_INTERVAL) {
             this.lastThinkingEmit = now;
             this.emit("thinkingBlock", this.thinkingController.getDisplayState());
          }
        }
        if (chunk.type === "error") throw chunk.error;
      }
    } catch (e: any) {
      if (depth < 1) {
        this.emit("status", "System is retrying planning phase...");
        return this.runPlanningPhase(ctx, depth + 1);
      }
      this.emit("error", e);
      return { plan: null, responded: false };
    } finally {
      clearInterval(heartbeat);
    }

    const flushed = tagFilter.flush();
    if (flushed.display) {
      displayBuffer += flushed.display;
      this.emit("token", flushed.display);
    }
    if (flushed.thinking) {
      thinkingBuffer += flushed.thinking;
      this.thinkingController.feedToken(flushed.thinking);
    }
    
    tagFilter.reset();

    if (xmlToolCallDetected && !planBuffer) return { plan: null, responded: false };

    if (planBuffer) {
      const rawPlan = planBuffer.includes("<plan>") ? planBuffer.split("<plan>")[1].split("</plan>")[0] : planBuffer;
      const parsed = new PlanParser().parse(rawPlan);
      this.emit("planReady", parsed);
      return { plan: parsed, responded: true };
    }

    if (toolCallsDuringPlanning.length > 0) {
      this.emit("planRetrying", { reason: "Refining strategy..." });
      const forcedPlan = await this.retryPlanningWithForce(ctx);
      if (forcedPlan) return { plan: forcedPlan, responded: true };

      const syntheticSteps = toolCallsDuringPlanning.map((tc, i) => ({
        number: i + 1,
        verb: tc.toolName === "run_shell" ? "Run" : 
              tc.toolName === "write_file" ? "Create" :
              tc.toolName === "edit_file" ? "Edit" :
              tc.toolName === "read_file" ? "Read" : "Execute",
        target: typeof tc.args === "object" ? (tc.args.path || tc.args.file || tc.args.dir || tc.args.directory || tc.args.command || tc.args.cmd || tc.toolName) : tc.toolName,
        reason: "Auto-generated from model execution",
        isDestructive: ["write_file", "edit_file", "run_shell"].includes(tc.toolName),
        requiresConfirm: false,
      }));

      const syntheticPlan: ParsedPlan = {
        goal: `Execute ${toolCallsDuringPlanning[0].toolName}`,
        steps: syntheticSteps,
        filesAffected: [],
        assumptions: [],
        risks: [],
        isDestructive: toolCallsDuringPlanning.some(tc => 
          ["write_file", "edit_file", "run_shell"].includes(tc.toolName)
        ),
        estimatedSteps: syntheticSteps.length,
        confidence: "low",
        raw: `GOAL: Direct execution\nSTEPS:\n${syntheticSteps.map(s => `${s.number}. ${s.verb} ${s.target}`).join("\n")}`
      };

      this.emit("planReady", syntheticPlan);
      return { plan: syntheticPlan, responded: true };
    }

    const lowerText = displayBuffer.toLowerCase();
    // isLazyPreamble: Hanya trigger jika respons PENDEK dan jelas bukan jawaban substantif.
    // Hindari kata umum bahasa Indonesia yang bisa muncul di respons normal.
    const isLazyPreamble = !planBuffer && displayBuffer.length > 10 && displayBuffer.length < 200 && (
        /^(baik|siap|tentu|oke|ok),?\s/i.test(lowerText) ||           // Dimulai dgn kata preamble
        lowerText.includes("saya akan coba") ||
        lowerText.includes("i will try") ||
        lowerText.includes("i'll look") ||
        lowerText.includes("let me try") ||
        lowerText.includes("saya lihat dulu") ||
        lowerText.includes("cara simpan") || lowerText.includes("copy text") ||
        lowerText.includes("bisa simpan") || lowerText.includes("silakan simpan") ||
        lowerText.includes("paste ke")
    );

    if (isLazyPreamble && depth === 0) {
        this.messages.push({ 
            id: uuidv4(), role: "user", 
            content: "CRITICAL: Do not just talk. Match my request with actions. Please provide a surgical <plan> now." 
        });
        return await this.runPlanningPhase(ctx, 1);
    }

    if (displayBuffer.trim()) {
      // If we had tool calls but no plan tags, we already generated a synthetic plan. 
      // Do NOT push the raw (likely conversational/preamble) displayBuffer to history 
      // as it confuses the model in the next turn.
      if (toolCallsDuringPlanning.length === 0) {
        this.messages.push({ id: uuidv4(), role: "assistant", content: displayBuffer });
        this.trimMessages();
      }
    }
    return { plan: null, responded: displayBuffer.trim().length > 0 };
  }

  private showPlanAndWaitApproval(plan: ParsedPlan): Promise<boolean> {
    return new Promise((resolve) => {
      this.emit("awaitingPlanApproval", plan);
      const handleChoice = (choice: "approve" | "reject") => {
         this.removeListener("planChoice", handleChoice);
         resolve(choice === "approve");
      };
      this.on("planChoice", handleChoice);

      // Timeout after 10 minutes
      setTimeout(() => {
         this.removeListener("planChoice", handleChoice);
         resolve(false);
      }, 10 * 60 * 1000);
    });
  }

  private async runExecutionPhase(plan: ParsedPlan | null, ctx: ProjectContext): Promise<void> {
    this.thinkingController.reset();
    // Reset no-op handler and plan enforcer for each execution phase
    this.noOpHandler.reset();
    this.planEnforcer.reset();

    if (plan) {
      this.initSteps(plan);
      this.planEnforcer.setApprovedPlan(plan);

      // Silence internal nudge messages from the UI to make it feel direct
      const msg = { 
        id: uuidv4(), 
        role: "assistant" as const, 
        content: `I am starting the execution of the approved plan now: "${plan.goal}".` 
      };
      this.messages.push(msg);

      const userMsg = { 
        id: uuidv4(), 
        role: "user" as const, 
        content: `Proceed with the execution. Goal: "${plan.goal}". Use your tools to complete all steps.` 
      };
      this.messages.push(userMsg);
      this.emit("planApproved", plan);
      this.emit("status", "Starting execution phase...");
      this.trimMessages();
    }

    const EXECUTION_TIMEOUT = this.config.executionTimeoutMs ?? 10 * 60 * 1000;
    // PRE-EXECUTION TOKEN BUDGET CHECK
    const systemPrompt = await this.getSystemPrompt(ctx, EXECUTION_SYSTEM_PROMPT);
    const budget = this.tokenBudget.check(
      typeof systemPrompt === "string" ? systemPrompt : JSON.stringify(systemPrompt),
      this.getSmartTools(),
      this.messages
    );
    this.emit("status", this.tokenBudget.formatStatus(budget));

    const result = streamText({
      model: this.model,
      system: systemPrompt,
      messages: this.adaptMessages(this.messages),
      tools: this.getSmartTools(), // Smart selection — only relevant tools for this task
      stopWhen: stepCountIs(this.maxIterations),
      abortSignal: this.createAbortSignal(EXECUTION_TIMEOUT),
      maxRetries: 5,
      maxOutputTokens: 4096,
      onStepFinish: (ev: any) => {
        if (ev.usage) {
          this.tokenUsage.prompt += ev.usage.promptTokens || 0;
          this.tokenUsage.completion += ev.usage.completionTokens || 0;
        }
        const respMsgs = ev.response?.messages || ev.responseMessages;
        if (respMsgs) {
            for (const m of respMsgs) {
              // Robust dedup: check last 5 messages for content match
              const fp = this.contentFingerprint(m.content);
              const isDuplicate = this.messages.slice(-5).some(existing => 
                existing.role === m.role && this.contentFingerprint(existing.content) === fp
              );
              
              const hasTools = Array.isArray(m.content) && m.content.some((c: any) => c.type === 'tool-call' || c.type === 'tool-result');
              const isToolMsg = m.role === 'tool' || (m as any).toolCallId;

              if (isDuplicate && !hasTools && !isToolMsg) continue;
              this.messages.push({ ...m, id: uuidv4() });
            }
            this.trimMessages();
        }
      }
    });

    const execTagFilter = TagStripper.createStreamingFilter();
    let fullText = "";
    let totalToolCalls = 0;
    
    let lastTokenTime = Date.now();
    let lastExecDisplayTime = Date.now();
    let execStallAlerted = false;
    const HEARTBEAT_MS = 60000;
    const heartbeat = setInterval(() => {
      const displayElapsed = Date.now() - lastExecDisplayTime;
      // Alert user if no visible output for 15s during execution
      if (displayElapsed > 15_000 && !execStallAlerted) {
        execStallAlerted = true;
        this.emit("status", "Model is processing internally...");
      }
      if (Date.now() - lastTokenTime > HEARTBEAT_MS) {
        this.currentAbortController?.abort(new Error(`Model stalled during execution (${HEARTBEAT_MS/1000}s silence).`));
      }
    }, 5000);

    try {
      for await (const chunk of result.fullStream) {
        lastTokenTime = Date.now();
        const curIdx = Math.min(this.currentStepIndex, Math.max(0, (this.trackedSteps?.length || 1) - 1));
        if (chunk.type === "text-delta") {
          const { display, thinking } = execTagFilter.feed(chunk.text);
          if (thinking) {
            this.thinkingController.feedToken(thinking);
            this.emit("thinkingState", this.thinkingController.getDisplayState());
          }
          if (display) {
            fullText += display;
            lastExecDisplayTime = Date.now();
            execStallAlerted = false;
            this.emit("token", display);
          }
        } else if (chunk.type === "tool-call") {
          totalToolCalls++;
          this.emit("toolCall", chunk);
          const toolId = (chunk as any).toolCallId || `${(chunk as any).toolName}-${totalToolCalls}`;
          const toolName = (chunk as any).toolName;
          const toolArgs = (chunk as any).args || chunk.input;
          
          this.activeToolCalls.set(toolId, { name: toolName, args: toolArgs });
          
          // Plan enforcement — soft validation
          const planCheck = this.planEnforcer.validateToolCall(toolName, toolArgs);
          if (!planCheck.valid) {
            this.emit("info", `⚠️ ${planCheck.message}`);
          }

          this.todoTracker.add(toolId, toolName, toolArgs);
          this.emit("todoUpdate", this.todoTracker.getAll());

          if (this.trackedSteps[curIdx]) {
            this.updateStep(curIdx, { status: "running", toolCallsMade: (this.trackedSteps[curIdx].toolCallsMade || 0) + 1 });
          }
        } else if (chunk.type === "tool-result") {
          this.emit("toolResult", chunk);
          const resultId = (chunk as any).toolCallId;
          const isError = (chunk as any).result?.isError === true;
          
          if (resultId) {
            this.todoTracker.update(resultId, isError ? "error" : "done");
            this.emit("todoUpdate", this.todoTracker.getAll());
            
            const call = this.activeToolCalls.get(resultId);
            if (call) {
              // ✨ SPECIAL: update_plan handling (OpenClaw style)
              if (call.name === "update_plan" && !isError) {
                const res = (chunk as any).result;
                if (res && res.steps) {
                  this.emit("info", "🔄 Syncing new roadmap...");
                  this.initSteps({ 
                    raw: "",
                    goal: res.explanation || "Updated mission goal", 
                    steps: res.steps, 
                    filesAffected: [],
                    assumptions: [],
                    risks: [],
                    isDestructive: false,
                    estimatedSteps: res.steps.length,
                    confidence: "high"
                  });
                  // Find the next in_progress step
                  const nextIdx = res.steps.findIndex((s: any) => s.status === "in_progress");
                  if (nextIdx !== -1) this.currentStepIndex = nextIdx;
                }
              }

              // High-Quality Verify Step (Anti-Hallucination)
              const verification = await StepVerifier.verify(call.name, call.args, (chunk as any).result, this.ctx);
              if (!verification.verified) {
                const failMsg = `⚠️ VERIFICATION FAILED: ${verification.message} ${verification.suggestion || ""}`;
                this.emit("info", failMsg);
                
                // Inject a corrective message into the conversation to force the AI to fix it
                this.messages.push({ 
                  id: uuidv4(), 
                  role: "user", 
                  content: `CRITICAL: Your last action '${call.name}' failed verification. ${verification.message} ${verification.suggestion || ""}`
                });
                this.trimMessages();
              }

              this.loopDetector.record(call.name, call.args, isError);
              this.activeToolCalls.delete(resultId);
            }
          }
          
          if (!isError) {
             this.updateStep(curIdx, { status: "done" });
             if (this.currentStepIndex < this.trackedSteps.length - 1) this.currentStepIndex++;
          }
          
          // Loop detector removed per user request
        }
      }

      const flushed = execTagFilter.flush();
      if (flushed.display) {
        fullText += flushed.display;
        this.emit("token", flushed.display);
      }

      // ✨ NoOpHandler: replaces inline no-op logic with escalating retry + hard stop
      if (totalToolCalls > 0) {
        this.noOpHandler.reset();
      } else if (fullText.trim() && !fullText.includes("<plan>")) {
        const noOpResult = this.noOpHandler.handleNoOp(plan);
        if (noOpResult.action === "retry") {
          this.messages.push({ id: uuidv4(), role: "user", content: noOpResult.message });
          await this.runExecutionRetry(ctx);
          return;
        } else {
          // Abort — agent failed to use tools after max retries
          this.emit("token", "\n" + noOpResult.message);
          this.messages.push({ id: uuidv4(), role: "assistant", content: noOpResult.message });
          this.trimMessages();
          return;
        }
      }

      if (fullText.trim()) {
          
          // -- INVISIBLE REFLECTOR MODULE (Pilar 3: Kualitas Puncak) --
          if (totalToolCalls > 0 && !fullText.includes("I'm not sure")) {
             this.emit("status", "Reflecting on output quality...");
             try {
                 const critique = await generateText({
                     model: this.model,
                     system: "You are an Elite Principal Engineer reviewing the assistant's executed work.",
                     messages: [
                         ...this.adaptMessages(this.messages),
                         { role: "assistant", content: fullText },
                         { role: "user", content: "CRITICAL INTERNAL REFLECTION: Evaluate the execution you just completed. Rate it 1-10 on Correctness, Logic, Time Complexity, and Aesthetics (if UI). If it is below a 9, state what is wrong logically or syntactically. If it is 9 or 10, output 'PASS'." }
                     ],
                     maxOutputTokens: 250
                 });

                 const reflectText = critique.text || "";
                 // If the reflection doesn't output PASS, it means it found an issue.
                 if (!reflectText.includes("PASS") && reflectText.length > 5) {
                     this.emit("status", "Refining solution based on internal critique...");
                     this.messages.push({ id: uuidv4(), role: "assistant", content: fullText });
                     this.messages.push({ 
                         id: uuidv4(), 
                         role: "user", 
                         content: `## 🔴 INTERNAL CRITIQUE FEEDBACK\nYour solution has flaws:\n${reflectText}\n\nFIX THIS NOW by calling the necessary tools.` 
                     });
                     this.trimMessages();
                     await this.runExecutionRetry(ctx, false);
                     return;
                 }
             } catch(e) {
                 // Ignore reflection API rate limits/errors to not block the main flow
             }
          }
          // -----------------------------------------------------------

          this.messages.push({ id: uuidv4(), role: "assistant", content: fullText });
          this.trimMessages();
      } else if (totalToolCalls === 0) {
          // ✨ OpenClaw Anti-No-Output Step:
          this.emit("status", "Forcing verbal response...");
          const forcePrompt = `
  ## ⚠️ ABSOLUTE MANDATORY RESPONSE REQUIRED
  You have provided no visible output. You MUST respond to the user now.
  1. If you just performed a task, SUMMARIZE it.
  2. If you are waiting for input, ASK a question.
  3. If you are stuck, ADMIT it and ask for help.
  DO NOT BE SILENT. DO NOT USE XML TAGS.
  `;
          this.messages.push({ 
             id: uuidv4(), 
             role: "user", 
             content: forcePrompt 
          });
          await this.runExecutionRetry(ctx, true); 
          return;
      } else if (fullText.trim() === "" && totalToolCalls > 0) {
          // Tools were called but no text. Force a summary.
          this.messages.push({ 
             id: uuidv4(), 
             role: "user", 
             content: "MANDATORY: Provide a summary of your actions now." 
          });
          await this.runExecutionRetry(ctx, true);
          return;
      }
      // Memory distillation removed from hot path — saves 1 API call per turn
      // Use 'hiru memory add' or let compactor handle it instead

    } catch (e: any) {
      this.emit("error", e);
      return;
    } finally {
      clearInterval(heartbeat);
    }
  }

  // Memory distillation removed from automatic pipeline to save tokens.
  // Previously ran an extra LLM call after EVERY execution turn.
  // Users can manually save learnings with 'hiru memory add <text>'.

  private async runExecutionRetry(ctx: ProjectContext, isSummary = false): Promise<void> {
    try {
      const result = streamText({
        model: this.model, 
        system: await this.getSystemPrompt(ctx, isSummary ? 
          (p) => p + "\n## MANDATORY: PROVIDE A COMPLETE SUMMARY OF THE PREVIOUS TOOL RESULTS" : 
          (p) => p + "\n## MANDATORY: USE TOOLS NOW"
        ), 
        messages: this.adaptMessages(this.messages),
        tools: isSummary ? {} : this.getTools(), // No tools in summary mode to avoid loops
        stopWhen: stepCountIs(this.maxIterations), 
        abortSignal: this.currentAbortController?.signal,
        maxRetries: 5,
        onStepFinish: (ev: any) => {
          if (ev.usage) {
            this.tokenUsage.prompt += ev.usage.promptTokens || 0;
            this.tokenUsage.completion += ev.usage.completionTokens || 0;
          }

          // Intelligence Upgrade v2: Pattern Library detection
          if (ev.toolResults) {
            for (const res of (ev.toolResults as any[])) {
              if (res.result?.error || res.isError) {
                const errorText = res.result?.error || res.result || "Unknown error";
                const pattern = this.errorLibrary.match(res.toolName, errorText);
                if (pattern) {
                  this.emit("status", this.errorLibrary.formatHint(pattern));
                }
                this.errorLibrary.recordError(res.toolName, res.args, errorText, false);
              }
            }
          }
        },
      });
      let retryText = "";
      const retryTagFilter = TagStripper.createStreamingFilter();

      for await (const chunk of result.fullStream) {
        if (chunk.type === "text-delta") { 
          const { display } = retryTagFilter.feed(chunk.text);
          if (display) {
            retryText += display; 
            this.emit("token", display); 
          }
        }
        else if (chunk.type === "tool-call") this.emit("toolCall", chunk);
        else if (chunk.type === "tool-result") this.emit("toolResult", chunk);
      }
      
      // Final flush
      const flushed = retryTagFilter.flush();
      if (flushed.display) {
         retryText += flushed.display;
         this.emit("token", flushed.display);
      }
      if (retryText.trim()) {
         this.messages.push({ id: uuidv4(), role: "assistant", content: retryText });
         this.trimMessages();
      } else {
         const fallback = "I understand. Is there anything else I can help you with?";
         this.messages.push({ id: uuidv4(), role: "assistant", content: fallback });
         this.emit("token", fallback);
      }
    } catch (e: any) {
      // Jangan re-throw, cukup emit sebagai info agar tidak crash caller
      this.emit("info", `Retry stream ended: ${(e as any).message}`);
    }
  }

  async resolvePlanApproval(approved: boolean) {
    this.emit("planChoice", approved ? "approve" : "reject");
  }

  private async retryPlanningWithForce(ctx: ProjectContext): Promise<ParsedPlan | null> {
    this.messages.push({ id: uuidv4(), role: "user", content: "MANDATORY: Provide a <plan> block now." });
    this.thinkingController.reset();
    const tagFilter = TagStripper.createStreamingFilter();
    let planBuffer = "";
    const result = await streamText({
      model: this.model, 
      system: await this.getSystemPrompt(ctx, PLANNING_SYSTEM_PROMPT), 
      messages: this.adaptMessages(this.messages),
      abortSignal: this.createAbortSignal(this.config.planningTimeoutMs ?? 180000),
    });
    for await (const chunk of result.fullStream) {
      if (chunk.type === "text-delta") {
        const { thinking, tagType } = tagFilter.feed(chunk.text);
        if (thinking && (tagType === "plan" || !tagType)) planBuffer += thinking;
      }
    }
    if (planBuffer) {
      const parsed = new PlanParser().parse(planBuffer.includes("<plan>") ? planBuffer.split("<plan>")[1].split("</plan>")[0] : planBuffer);
      this.emit("planReady", parsed);
      return parsed;
    }
    return null;
  }

  /**
   * Internal execution for subagents (no TUI event emission).
   * Used by AgentTool.
   */
  async runInternal(task: string, ctx: ProjectContext): Promise<string> {
    this.messages.push({ id: uuidv4(), role: "user", content: task });
    
    let iterations = 0;
    const MAX_SUB_STEPS = 10;
    let lastResponse = "";

    while (iterations < MAX_SUB_STEPS) {
      iterations++;
      const response = await generateText({
        model: this.model,
        system: await this.getSystemPrompt(ctx),
        messages: this.adaptMessages(this.messages),
        tools: this.getTools(),
      });

      lastResponse = response.text || "";
      this.messages.push({ id: uuidv4(), role: "assistant", content: response.content || lastResponse });
      
      if (!response.toolCalls || response.toolCalls.length === 0) {
        break; // DONE
      }

      // Execute tool calls and push results back
      const results = await Promise.all(response.toolCalls.map(async (tc) => {
        const toolId = (tc as any).toolCallId || uuidv4();
        const toolName = tc.toolName;
        const toolArgs = (tc as any).args;
        
        try {
          const res = await this.getTools()[toolName].execute(toolArgs);
          return { role: "tool" as const, content: res, toolCallId: toolId };
        } catch (e: any) {
          return { role: "tool" as const, content: `Error: ${e.message}`, toolCallId: toolId };
        }
      }));

      for (const res of results) {
        this.messages.push(res);
      }
      this.trimMessages();
    }
    
    return lastResponse || "No response generated by subagent.";
  }

  /** Stop any active execution/generation */
  stop() {
    this.currentAbortController?.abort(new Error("Hiru was stopped manually to prevent a loop or at user request."));
  }
}
