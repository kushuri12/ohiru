import { Message } from "../types.js";
import { createProviderInstance } from "../providers/index.js";
import { v4 as uuidv4 } from "uuid";
import { HiruConfig, ProjectContext } from "shared";
import { buildSystemPrompt } from "./ContextBuilder.js";
import { internalTools, setFileProgressCallback, toolEvents } from "../tools/index.js";
import { streamText, stepCountIs, ToolCallPart, ToolResultPart, generateText } from "ai";
import { EventEmitter } from "events";
import path from "path";
import { MemoryGuard } from "../memory/guard/MemoryGuard.js";
import { CheckpointManager } from "../memory/guard/CheckpointManager.js";
import { LoopDetector } from "../memory/guard/LoopDetector.js";
import { ToolSandbox } from "../memory/guard/ToolSandbox.js";
import chalk from "chalk";
import { 
  ThinkingController, 
  ThinkingMode, 
  ParsedPlan,
  PlanParser
} from "../thinking/index.js";
import { StreamingTagFilter, TagStripper } from "../thinking/TagStripper.js";
import { SectionParser, ParsedSection } from "../thinking/SectionParser.js";
import { PLANNING_SYSTEM_PROMPT, EXECUTION_SYSTEM_PROMPT, CHAT_SYSTEM_PROMPT } from "./prompts.js";
import { TodoTracker, TodoItem } from "./TodoTracker.js";
import { SkillManager, createSkillTools } from "../skills/index.js";
import { GlobalMemory, createMemoryTools } from "../memory/index.js";
import { FileProgressEvent, globalFileProgress } from "../tools/FileProgress.js";
import { createAgentTool } from "../tools/AgentTool.js";
import { Compactor } from "./Compactor.js";
import { ProjectSnapshot } from "./Snapshot.js";

export class HiruAgent extends EventEmitter {
  private model: any;
  private config: HiruConfig;
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

  private noOpCount = 0;
  private static readonly MAX_NO_OP = 2;

  private thinkingController: ThinkingController;
  private todoTracker: TodoTracker;
  private skillManager: SkillManager;
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

  constructor(config: HiruConfig, sessionId?: string) {
    super();
    this.config = config;
    this.model = createProviderInstance(config);
    this.sandbox = new ToolSandbox();
    this.loopDetector = new LoopDetector();
    this.checkpointManager = new CheckpointManager(sessionId);
    this.todoTracker = new TodoTracker();
    this.skillManager = new SkillManager();
    this.globalMemory = new GlobalMemory();
    this.compactor = new Compactor(this.model);

    // Init async stuff (non-blocking)
    Promise.all([
      this.skillManager.init(),
      this.globalMemory.init()
    ]).then(() => {
      this.skillsReady = true;
      const skills = this.skillManager.listSkills();
      if (skills.length > 0) {
        console.log(chalk.cyan(`  🧠 ${skills.length} skill(s) loaded: ${skills.map(s => s.name).join(", ")}`));
      }
      
      // Register memory tool
      const memoryTools = createMemoryTools(this.globalMemory);
      Object.assign(internalTools, memoryTools);

      // Register skill management tool + learned skill tools into internalTools
      const skillTools = createSkillTools(this.skillManager);
      Object.assign(internalTools, skillTools);
      Object.assign(internalTools, this.skillManager.getToolDefinitions());

      // RECURSIVE AGENT TOOL (Premium Design)
      const hiruSubagentTool = createAgentTool(
        (cfg) => new HiruAgent(cfg, "sub-session"), 
        this.config, 
        () => this.ctx // Return the current context at call-time
      );
      internalTools["hiru"] = hiruSubagentTool;

      // Re-register when skills change
      this.skillManager.on("skillCreated", () => {
        Object.assign(internalTools, this.skillManager.getToolDefinitions());
      });
      this.skillManager.on("skillUpdated", () => {
        Object.assign(internalTools, this.skillManager.getToolDefinitions());
      });
      this.skillManager.on("skillDeleted", (name: string) => {
        delete internalTools[`skill_${name}`];
      });
    }).catch(e => {
      console.error(chalk.yellow(`  ⚠️ Skills init failed: ${e.message}`));
    });
    
    // Setup Thinking Controller
    this.thinkingController = new ThinkingController({
      mode: (config.thinkingMode as ThinkingMode) || "compact",
      requirePlanApproval: config.planMode !== false,
      autoApproveReadOnly: config.autoApproveReadOnly !== false,
      showRawThinking: config.thinkingMode === "verbose",
    });

    // Forward thinking events — setup ONCE to avoid double listeners
    this.thinkingController.on("thinkingBlock", () => {
      this.emit("thinkingBlock", this.thinkingController.getDisplayState());
    });
    this.thinkingController.on("planReady", (plan) => this.emit("planReady", plan));
    this.thinkingController.on("toolCallDuringThinking", (info) => this.emit("toolCallDuringThinking", info));

    // Setup Memory Guard
    this.memoryGuard = new MemoryGuard();
    this.memoryGuard.on("warn", (s) => this.emit("memory_warn", s));
    this.memoryGuard.on("pressure", (s) => this.emit("memory_pressure", s));
    this.memoryGuard.on("emergency", (s) => this.emit("memory_emergency", s));
    this.memoryGuard.on("critical", (s) => {
      this.emit("memory_critical", s);
      if (this.currentAbortController) {
        this.currentAbortController.abort();
      }
      this.emit("error", new Error("Critical memory limit reached. Execution aborted to prevent crash."));
    });
    this.memoryGuard.start();

    // Setup File Progress Listener with reference for cleanup (Fix 1A)
    this.boundFileProgressHandler = (event: FileProgressEvent) => {
      this.emit("fileProgress", event);
    };
    globalFileProgress.on("fileProgress", this.boundFileProgressHandler);

    // Stream shell output (Fix: Live terminal logs)
    toolEvents.on("shell-output", (data: { text: string }) => {
      this.emit("toolOutput", data);
    });
  }

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
    
    // 1. Core Internal Tools
    for (const [name, tool] of Object.entries(internalTools)) {
      const t = tool as any;
      
      // Filter out write tools if read-only is requested (for planning phase)
      if (options.isReadonly) {
         const writeTools = ["write_file", "edit_file", "create_file", "delete_file", "run_shell", "run_tests", "git_operation", "create_directory"];
         if (writeTools.includes(name)) continue;
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
            const isReadOnly = ["list_files", "read_file", "search_files", "list_directory", "take_screenshot"].includes(name);
            const autoApprove = (this.thinkingController as any).config?.autoApproveReadOnly;
            
            if (isReadOnly && autoApprove) {
               // Bypass permission for read-only tools
            } else {
              const promise = new Promise((resolve) => {
                this.emit("permissionRequest", {
                  toolName: name,
                  args,
                  resolve
                });
              });
              const allowed = await promise;
              if (!allowed) return "User denied permission to run this tool.";
            }
          }
          return t.execute(args);
        }
      };
    }

    // 2. Dynamic Learned Skills
    if (this.skillManager) {
      const skillTools = this.skillManager.getToolDefinitions();
      for (const [name, tool] of Object.entries(skillTools)) {
        // Skill tools are essential context gatherers, but we'll monitor them
        wrappedTools[name] = tool; 
      }
    }

    return wrappedTools;
  }

  updateConfig(config: HiruConfig) {
    this.config = config;
    this.model = createProviderInstance(config);
    this.thinkingController.updateConfig({
      mode: (config.thinkingMode as ThinkingMode) || "compact",
      requirePlanApproval: config.planMode !== false,
      autoApproveReadOnly: config.autoApproveReadOnly !== false,
    });
  }

  private adaptMessages(messages: any[]): any[] {
    const hash = `${messages.length}_${messages[messages.length - 1]?.id || "empty"}`;
    if (this.adaptedMessagesCache?.hash === hash) {
      return this.adaptedMessagesCache.result;
    }
    const result = this.computeAdaptedMessages(messages);
    this.adaptedMessagesCache = { hash, result };
    return result;
  }

  private computeAdaptedMessages(messages: any[]): any[] {
    const raw: any[] = [];
    const MAX_SHRED = 8000; // Increased from 800 to 8000 bits/chars

    for (let i = 0; i < messages.length; i++) {
      const msg = { ...messages[i] };
      const isLast = i === messages.length - 1;

      try {
        if (!isLast && typeof msg.content === "string" && msg.content.length > MAX_SHRED) {
          msg.content = msg.content.slice(0, MAX_SHRED) + "\n[...content shredded for speed]";
        }

        if (msg.role === "user" || msg.role === "assistant") {
          if (!msg.content && !Array.isArray(msg.content)) continue;
          raw.push(msg); 
        } else if (msg.role === "tool" || msg.role === "tool_result") {
          const MAX_TOOL_SHRED = 60000; // Increased from 12000 to 60000
          const content = (msg as any).content || (msg as any).result || "";
          let finalContent = content;
          if (!isLast && typeof content === "string" && content.length > MAX_TOOL_SHRED) {
             finalContent = content.slice(0, MAX_TOOL_SHRED) + "... [Result shredded for speed]";
          }
          raw.push({ role: "tool", content: finalContent, toolCallId: (msg as any).toolCallId || (msg as any).id });
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
      if (last.role === "assistant") {
        fixed.push({ role: "user", content: "Please continue." });
      }
    }

    return fixed;
  }

  cleanup(): void {
    if (this.memoryGuard) this.memoryGuard.stop();
    if (this.boundFileProgressHandler) {
      globalFileProgress.off("fileProgress", this.boundFileProgressHandler);
      this.boundFileProgressHandler = null;
    }
    this.messages = [];
    this.trackedSteps = [];
    this.currentAbortController = null;
    this.thinkingController.removeAllListeners();
    if (this.checkpointManager) {
      this.checkpointManager.close();
    }
    this.todoTracker.reset();
    if (this.skillManager) this.skillManager.removeAllListeners();
    this.adaptedMessagesCache = null; 
    this.activeToolCalls.clear();
  }

  private trimMessages() {
    const MAX_KEEP = 30;   // Limited as requested
    const COMPRESS_AGE = 12; // Start compressing sooner
    const MAX_CONTENT = 3000; // Compress content more aggressively

    if (this.messages.length > COMPRESS_AGE) {
      const compressUntil = this.messages.length - 3; 

      for (let i = 0; i < compressUntil; i++) {
        const msg = this.messages[i];
        if (typeof msg.content === "string" && msg.content.length > MAX_CONTENT) {
          this.messages[i] = {
            ...msg,
            content: msg.content.slice(0, MAX_CONTENT) + "\n[...content compressed]",
          };
        }
        if (Array.isArray(msg.content)) {
          const compressed = msg.content.map((block: any) => {
            if (block.type === "text" && typeof block.text === "string" && block.text.length > MAX_CONTENT) {
              return { ...block, text: block.text.slice(0, MAX_CONTENT) + "\n[...compressed]" };
            }
            if (block.type === "tool-result") {
              const content = (typeof block.content === "string" ? block.content : JSON.stringify(block.content)) || "";
              if (content.length > MAX_CONTENT) {
                return { ...block, content: content.slice(0, MAX_CONTENT) + "\n[...compressed]" };
              }
            }
            return block;
          });
          this.messages[i] = { ...msg, content: compressed };
        }
      }
    }

    if (this.messages.length > MAX_KEEP) {
      const initialContext = this.messages.slice(0, 3); // Keep first 3 messages
      const rest = this.messages.slice(-(MAX_KEEP - 3));
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
  async runStreaming(input: string | any[], ctx: ProjectContext, history: any[] = []): Promise<void> {
    try {
      const MAX_RUN_RETRIES = 2;
      let runAttempt = 0;

      while (runAttempt < MAX_RUN_RETRIES) {
        try {
          await this.executeRunFlow(input, ctx, history);
          break; // Success!
        } catch (e: any) {
          runAttempt++;
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

  private async executeRunFlow(input: string | any[], ctx: ProjectContext, history: any[]) {
      this.ctx = ctx; // Capture context for subagents
      
      // Update internal messages with history from TUI
      if (history.length > 0) {
        this.messages = [...history];
        this.loopDetector.reset(); // Reset counts even with history (Fix 5A)
      } else {
        this.cleanup(); // Only cleanup if no history (fresh start)
        this.loopDetector.reset();
      }

      if (input) {
        if (typeof input === "string" && input.trim()) {
           this.messages.push({ id: uuidv4(), role: "user" as const, content: input });
        } else if (Array.isArray(input)) {
           this.messages.push({ id: uuidv4(), role: "user" as const, content: input });
        }
      }

      // Minimalist greeting filter - Only for extremely short greetings to keep response time low.
      // For everything else, let the LLM's brain decide (Planning Phase).
      const inputStr = typeof input === "string" ? input.trim() : "";
      const shortGreetings = /^(halo|hello|hi|p|pagi|siang|sore|malam|oi|hey|hiru)$/i;
      const isShortGreeting = inputStr && shortGreetings.test(inputStr) && inputStr.split(/\s+/).length < 3;
      
      if (isShortGreeting) {
         // Fast path for simple greetings
         const coreMessages = this.adaptMessages(this.messages);
         const greetingResult = await streamText({
            model: this.model,
            system: CHAT_SYSTEM_PROMPT(buildSystemPrompt(ctx, this.globalMemory, this.skillManager, this.activeSnapshot)),
            messages: coreMessages,
            abortSignal: this.createAbortSignal(30000),
            maxRetries: 5
         });

         const tagFilter = TagStripper.createStreamingFilter();
         for await (const text of greetingResult.textStream) {
            const { display } = tagFilter.feed(text);
            if (display) this.emit("token", display);
         }
         return;
      }

      const lastMsg = this.messages[this.messages.length - 2];
      const isApproval = typeof input === "string" && /^(y|yes|proceed|do it|kerjakan|go|ok|lanjut|sip|yup|gas)$/i.test(input.trim());
      
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
      
      // Auto-compact if too many messages (Mimicking Claude Code)
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
      system: PLANNING_SYSTEM_PROMPT(buildSystemPrompt(ctx, this.globalMemory, this.skillManager, this.activeSnapshot)),
      tools: this.getTools({ isReadonly: true }),
      abortSignal: this.createAbortSignal(PLANNING_TIMEOUT),
      maxRetries: 5,
      maxOutputTokens: 1024,  // ← TAMBAHKAN: planning tidak butuh banyak token
      onStepFinish: (ev: any) => {
        if (ev.usage) {
          this.tokenUsage.prompt += ev.usage.promptTokens || 0;
          this.tokenUsage.completion += ev.usage.completionTokens || 0;
        }
        const respMsgs = ev.response?.messages || ev.responseMessages;
        if (respMsgs) {
            const newMsgs = respMsgs.map((m: any) => ({
              id: uuidv4(), role: m.role, content: m.content
            }));
            for (const n of newMsgs) {
              const last = this.messages[this.messages.length - 1];
              if (last && last.role === n.role && last.content === n.content) continue;
              this.messages.push(n);
            }
            this.trimMessages();
        }
      }
    });

    let lastTokenTime = Date.now();
    let staledAlerted = false;
    const HEARTBEAT_MS = 20_000; // turun dari 60 detik → 20 detik
    let xmlToolCallDetected = false;
    const heartbeat = setInterval(() => {
      const elapsed = Date.now() - lastTokenTime;
      if (elapsed > 10_000 && !staledAlerted) {  // turun dari 30 detik → 10 detik
        staledAlerted = true;
        this.emit("thinkingStalled", { elapsed: 10 });
      }
      if (elapsed > HEARTBEAT_MS) {
        this.currentAbortController?.abort(new Error(`Model stalled (${HEARTBEAT_MS/1000}s silence). Check your internet or try a faster model.`));
      }
    }, 5000);

    try {
      for await (const chunk of result.fullStream) {
        lastTokenTime = Date.now();
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
    const isLazyPreamble = !planBuffer && displayBuffer.length > 10 && (
        lowerText.includes("baik") || lowerText.includes("siap") || 
        lowerText.includes("tentu") || lowerText.includes("akan") || 
        lowerText.includes("i will") || lowerText.includes("looking") ||
        lowerText.includes("trying") || lowerText.includes("lihat")
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
    if (plan) {
      this.initSteps(plan);
      // Ensure model has a clean assistant starting point with the plan
      const msg = { 
        id: uuidv4(), 
        role: "assistant" as const, 
        content: `I am starting the execution of the approved plan now: "${plan.goal}".` 
      };
      this.messages.push(msg);
      this.emit("contextMessage", msg);

      const userMsg = { 
        id: uuidv4(), 
        role: "user" as const, 
        content: `Proceed with the execution. Goal: "${plan.goal}". Use your tools to complete all steps.` 
      };
      this.messages.push(userMsg);
      this.emit("planApproved", plan);
      this.emit("contextMessage", userMsg);
      this.trimMessages();
    }

    const EXECUTION_TIMEOUT = this.config.executionTimeoutMs ?? 10 * 60 * 1000;
    const result = streamText({
      model: this.model,
      system: EXECUTION_SYSTEM_PROMPT(buildSystemPrompt(ctx, this.globalMemory, this.skillManager, this.activeSnapshot)),
      messages: this.adaptMessages(this.messages),
      tools: this.getTools(),
      stopWhen: stepCountIs(this.maxIterations),
      abortSignal: this.createAbortSignal(EXECUTION_TIMEOUT),
      maxRetries: 5,
      maxOutputTokens: 4096,  // ← TAMBAHKAN: cukup untuk execution tapi tetap bounded
      onStepFinish: (ev: any) => {
        if (ev.usage) {
          this.tokenUsage.prompt += ev.usage.promptTokens || 0;
          this.tokenUsage.completion += ev.usage.completionTokens || 0;
        }
        const respMsgs = ev.response?.messages || ev.responseMessages;
        if (respMsgs) {
            for (const m of respMsgs) {
              const last = this.messages[this.messages.length - 1];
              // Prevent exact duplicate appends (Fix Halu Parah)
              if (last && last.role === m.role && last.content === m.content) continue;
              this.messages.push({ id: uuidv4(), role: m.role, content: m.content });
            }
            this.trimMessages();
        }
      }
    });

    const execTagFilter = TagStripper.createStreamingFilter();
    let fullText = "";
    let totalToolCalls = 0;
    
    let lastTokenTime = Date.now();
    const HEARTBEAT_MS = 60000;
    const heartbeat = setInterval(() => {
      if (Date.now() - lastTokenTime > HEARTBEAT_MS) {
        this.currentAbortController?.abort(new Error(`Model stalled during execution (${HEARTBEAT_MS/1000}s silence).`));
      }
    }, 5000);

    try {
      for await (const chunk of result.fullStream) {
        lastTokenTime = Date.now();
        const curIdx = Math.min(this.currentStepIndex, Math.max(0, (this.trackedSteps?.length || 1) - 1));
        if (chunk.type === "text-delta") {
          const { display } = execTagFilter.feed(chunk.text);
          if (display) {
            fullText += display;
            this.emit("token", display);
          }
        } else if (chunk.type === "tool-call") {
          totalToolCalls++;
          this.emit("toolCall", chunk);
          const toolId = (chunk as any).toolCallId || `${(chunk as any).toolName}-${totalToolCalls}`;
          const toolName = (chunk as any).toolName;
          const toolArgs = (chunk as any).args || chunk.input;
          
          this.activeToolCalls.set(toolId, { name: toolName, args: toolArgs });
          
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
              this.loopDetector.record(call.name, call.args, isError);
              this.activeToolCalls.delete(resultId);
            }
          }
          
          if (!isError) {
             this.updateStep(curIdx, { status: "done" });
             if (this.currentStepIndex < this.trackedSteps.length - 1) this.currentStepIndex++;
          }
          
          const loop = this.loopDetector.detect();
          if (loop.isLoop) {
            this.emit("error", new Error(`Loop: ${loop.message}`));
            return;
          }
        }
      }
    } catch (e: any) {
      this.emit("error", e);
      return;
    } finally {
      clearInterval(heartbeat);
    }

    const flushed = execTagFilter.flush();
    if (flushed.display) {
      fullText += flushed.display;
      this.emit("token", flushed.display);
    }

    this.noOpCount = totalToolCalls === 0 ? this.noOpCount + 1 : 0;
    if (totalToolCalls === 0 && fullText.trim() && !fullText.includes("<plan>") && this.noOpCount < 2) {
        this.messages.push({ id: uuidv4(), role: "user", content: "USE TOOLS NOW. Do not just talk." });
        await this.runExecutionRetry(ctx);
        return;
    }

    if (fullText.trim()) {
       this.messages.push({ id: uuidv4(), role: "assistant", content: fullText });
       this.trimMessages();
    } else if (totalToolCalls === 0) {
       const fallback = "I understand. How can I help you with this project?";
       this.messages.push({ id: uuidv4(), role: "assistant", content: fallback });
       this.emit("token", fallback);
    } else {
       // Tools were called but no textual response was generated (Minimalism/Law 10 side effect)
       // Force a summary turn
       this.messages.push({ id: uuidv4(), role: "user", content: "Task complete. Provide a textual summary of your results for me now." });
       await this.runExecutionRetry(ctx, true); // True = summary mode
       return;
    }
  }

  private async runExecutionRetry(ctx: ProjectContext, isSummary = false): Promise<void> {
    const retryPrompt = buildSystemPrompt(ctx, this.globalMemory, this.skillManager, this.activeSnapshot) + 
      (isSummary ? "\n## MANDATORY: PROVIDE A COMPLETE SUMMARY OF THE PREVIOUS TOOL RESULTS" : "\n## MANDATORY: USE TOOLS NOW");
    
    const result = streamText({
      model: this.model, 
      system: retryPrompt, 
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
      model: this.model, system: PLANNING_SYSTEM_PROMPT(buildSystemPrompt(ctx, this.globalMemory, this.skillManager, this.activeSnapshot)), messages: this.adaptMessages(this.messages),
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
        system: buildSystemPrompt(ctx, this.globalMemory, this.skillManager, this.activeSnapshot),
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
}
