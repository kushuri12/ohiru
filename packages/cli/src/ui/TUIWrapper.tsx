import React, { useState, useEffect, useCallback, useRef } from "react";
import { useApp, useInput } from "ink";
import { App } from "./App.js";
import { HiruAgent } from "../agent/Agent.js";
import { ProjectContext } from "shared";
import { Message, ActiveTool } from "../types.js";
import { saveSession } from "../memory/SessionManager.js";
import { v4 as uuidv4 } from "uuid";
import { TodoItem } from "../agent/TodoTracker.js";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync, spawnSync } from "child_process";
import { PlanParser } from "../thinking/PlanParser.js";
import { FileProgressEvent } from "../tools/FileProgress.js";

interface TUIWrapperProps {
  agent: HiruAgent;
  ctx: ProjectContext;
  sessionId: string;
  config: any;
  version: string;
}

export function TUIWrapper({ agent, ctx, sessionId, config: initialConfig, version }: TUIWrapperProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentConfig, setCurrentConfig] = useState(initialConfig);
  const [pendingPermission, setPendingPermission] = useState<{toolName: string, args: any, resolve: (v: boolean) => void} | null>(null);
  const [pendingPlan, setPendingPlan] = useState<any | null>(null);
  const [thinkingState, setThinkingState] = useState<any>(null);
  const [executionSteps, setExecutionSteps] = useState<any[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [processingElapsedMs, setProcessingElapsedMs] = useState(0);

  const processingStartTime = useRef<number | null>(null);
  const watchdogTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const streamRef = useRef("");
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_UI_MESSAGES = 100;

  const { exit } = useApp();

  useInput((input, key) => {
    if (key.escape) { agent.cleanup(); exit(); process.exit(0); }
    if (key.ctrl && input === "l") { setMessages([]); }
    if (key.ctrl && input === "c") { 
        if (isProcessing) {
            agent.abortCurrentRun();
            setMessages(prev => [...prev, { 
                id: uuidv4(), 
                role: "system", 
                content: " \u26a0\ufe0f Execution interrupted by user." 
            }]);
            
            // Clean state
            if (elapsedTimer.current) {
                clearInterval(elapsedTimer.current);
                elapsedTimer.current = null;
            }
            if (watchdogTimer.current) {
                clearInterval(watchdogTimer.current);
                watchdogTimer.current = null;
            }
            setProcessingElapsedMs(0);
            setIsProcessing(false);
            setIsThinking(false);
            setActiveTool(null);
            setIsExecuting(false);
            commitStream();
        } else {
            agent.cleanup(); 
            exit(); 
            process.exit(0); 
        }
    }
    if (key.ctrl && input === "e") { setIsExpanded(prev => !prev); }

    // Handle Permission Prompt (y/n)
    if (pendingPermission) {
        if (input.toLowerCase() === 'y' || key.return) {
            setMessages(prev => [...prev, { id: uuidv4(), role: "system", content: `\u2705 User allowed execution of ${pendingPermission.toolName}` }]);
            pendingPermission.resolve(true);
            setPendingPermission(null);
        } else if (input.toLowerCase() === 'n') {
            setMessages(prev => [...prev, { id: uuidv4(), role: "system", content: `\u274c User denied execution of ${pendingPermission.toolName}` }]);
            pendingPermission.resolve(false);
            setPendingPermission(null);
        }
    }
  });

  const forceFlush = useCallback(() => {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current); flushTimer.current = null;
    }
    setStreamingText(streamRef.current);
  }, []);

  const commitStream = useCallback(() => {
    forceFlush();
    const text = streamRef.current;
    if (text.trim()) {
      setMessages(prev => [...prev, { id: uuidv4(), role: "assistant", content: text }]);
    }
    streamRef.current = "";
    setStreamingText("");
  }, [forceFlush]);

  const scheduleFlush = useCallback(() => {
    if (!flushTimer.current) {
      flushTimer.current = setTimeout(() => {
        flushTimer.current = null; setStreamingText(streamRef.current);
      }, 70);
    }
  }, []);

  const pendingArgCache = useRef<Record<string, any>>({});

  const trimMessages = useCallback((msgs: Message[]): Message[] => {
    if (msgs.length <= MAX_UI_MESSAGES) return msgs;
    return msgs.slice(-60);
  }, []);

  useEffect(() => {
    const onToken = (t: string) => {
      streamRef.current += t; scheduleFlush(); setIsThinking(false);
    };

    const onToolCall = (c: any) => {
      commitStream();
      if (c.toolCallId) {
        pendingArgCache.current[c.toolCallId] = c.args || (c as any).input;
      }
      const name = c.toolName || "tool";
      const isFileOp = name === "write_file" || name === "edit_file" || name === "create_file";
      
      setActiveTool({ 
        name, 
        input: c.args || (c as any).input || {}, 
        startTime: Date.now(),
        progress: isFileOp ? { percent: 0, linesWritten: 0, totalLines: 0, bytesWritten: 0, totalBytes: 0, speed: "0 KB/s", eta: 0, message: "Initializing..." } : undefined
      });
      setIsThinking(false);
      setLastError(null);
    };

    const onToolResult = (r: any) => {
       const savedArgs = pendingArgCache.current[r.toolCallId] || r.args || (r as any).input || {};
       delete pendingArgCache.current[r.toolCallId];
       const resVal = r.result !== undefined ? r.result : (r.content || "Done");
       setMessages(prev => [
         ...prev,
         { 
           id: uuidv4(), 
           role: "tool_call", 
           content: "", 
           toolCall: { name: r.toolName || "tool", input: savedArgs }, 
           toolResult: { result: resVal, isError: !!r.error } 
         }
       ]);
        setActiveTool(null);
        // Do not reset isExecuting here; it should stay true until onDone
    };

    const onStepsInit = (steps: any[]) => {
      setExecutionSteps(steps);
      setCurrentStepIndex(0);
      setIsExecuting(true);
    };

    const onStepUpdate = (ev: { index: number, step: any }) => {
      setExecutionSteps(prev => {
        const next = [...prev];
        next[ev.index] = ev.step;
        return next;
      });
      if (ev.step.status === "running") {
        setCurrentStepIndex(ev.index);
        setIsExecuting(true);
      }
    };

    const onPermissionRequest = (req: any) => {
        setPendingPermission(req);
        setIsThinking(false);
    };

    const onDone = () => { 
      commitStream(); 
      setTimeout(() => {
        setMessages(prev => {
          const hasAssistantMsg = prev.slice(-3).some(m => m.role === "assistant");
          if (!hasAssistantMsg) {
            return [...prev, { id: uuidv4(), role: "assistant", content: "Saya siap membantu. Apa yang perlu Anda kerjakan?" }];
          }
          return prev;
        });
      }, 100);
      setIsThinking(false); setActiveTool(null); setIsExecuting(false); setTodos([]); setIsProcessing(false); 
    };

    const onError = (e: any) => {
      const msg = e.message || String(e);
      setLastError(msg);
      if (!msg.toLowerCase().includes("loop detector")) {
        setMessages(prev => [...prev, { id: uuidv4(), role: "system", content: `Error: ${msg}` }]);
      }
      setIsThinking(false);
      setActiveTool(null);
      setIsExecuting(false);
      setIsProcessing(false);
    };

    const onAwaitingPlanApproval = (plan: any) => {
        setPendingPlan(plan);
        setIsThinking(false);
    };

    const onPlanApproved = (plan: any) => {
        setPendingPlan(null);
        setIsExecuting(true);
        setExecutionSteps(plan.steps.map((s: any) => ({
            step: s,
            status: "pending",
            toolCallsMade: 0
        })));
        setCurrentStepIndex(0);
    };

    const onPlanRejected = () => {
        setPendingPlan(null);
        setIsExecuting(false);
        setIsProcessing(false);
        setIsThinking(false);
        setActiveTool(null);
    };

    const onPlanAutoApproved = (plan: any) => {
        setPendingPlan(null);
        setIsExecuting(true);
        if (plan?.steps) {
          setExecutionSteps(plan.steps.map((s: any) => ({
              step: s,
              status: "pending",
              toolCallsMade: 0
          })));
          setCurrentStepIndex(0);
        }
        setMessages(prev => [...prev, { 
          id: uuidv4(), 
          role: "system", 
          content: `🚀 Executing plan (${plan?.steps?.length || "?"} steps)` 
        }]);
    };

    const onThinkingBlock = (state: any) => {
        setThinkingState(state);
    };

    const onContextMessage = (msg: any) => {
        setMessages(prev => [...prev, msg]);
    };
    
    const onPlanRetrying = (ev: { reason: string }) => {
        commitStream();
        setIsThinking(true);
        setMessages(prev => [...prev, { id: uuidv4(), role: "system", content: `\ud83d\udd04 ${ev.reason}. Retrying...` }]);
    };

    const onModelWarning = (warning: string) => {
      setMessages(prev => [...prev, {
        id: uuidv4(),
        role: "system",
        content: `⚠️ ${warning}`,
      }]);
    };

    const onTodoUpdate = (items: TodoItem[]) => {
      setTodos([...items]);
    };

    const onToolOutput = (data: { text: string }) => {
        setActiveTool(prev => {
            if (!prev || prev.name !== "run_shell") return prev;
            const newText = data.text;
            const currentLines = [...(prev.liveLines || [])];
            
            const incoming = newText.split("\n");
            if (incoming.length > 0) {
                if (currentLines.length > 0 && !newText.startsWith("\n")) {
                    currentLines[currentLines.length - 1] += incoming[0];
                    if (incoming.length > 1) {
                        currentLines.push(...incoming.slice(1));
                    }
                } else {
                    currentLines.push(...incoming);
                }
            }
            
            return { ...prev, liveLines: currentLines.slice(-200) };
        });
    };

    const onFileProgress = (event: FileProgressEvent) => {
      if (event.type !== "progress" && event.type !== "complete") return;

      const elapsedMs = event.elapsedMs || 0;
      const speed = elapsedMs > 0 ? ((event.bytesWritten / 1024) / (elapsedMs / 1000)).toFixed(1) : "0";
      const eta = event.percent > 0 ? Math.round((elapsedMs / event.percent) * (100 - event.percent) / 1000) : 0;
      
      setActiveTool(prev => {
        if (!prev || (prev.name !== "write_file" && prev.name !== "edit_file" && prev.name !== "create_file")) {
          return prev;
        }

        // Live preview lines (Fix 2B)
        const fullContent = prev.input?.content || prev.input?.new_content || "";
        const allLines = fullContent.split("\n");
        const writtenCount = Math.min(event.linesWritten, allLines.length);
        const liveLines = allLines.slice(0, writtenCount);

        return {
          ...prev,
          liveLines,
          liveLinesTotal: allLines.length,
          progress: {
            percent: event.percent,
            linesWritten: event.linesWritten,
            totalLines: event.totalLines,
            bytesWritten: event.bytesWritten,
            totalBytes: event.totalBytes,
            speed: `${speed} KB/s`,
            eta,
            message: event.message,
          }
        };
      });
    };

    agent.on("stepsInit", onStepsInit);
    agent.on("stepUpdate", onStepUpdate);
    agent.on("token", onToken);
    agent.on("toolCall", onToolCall);
    agent.on("toolResult", onToolResult);
    agent.on("permissionRequest", onPermissionRequest);
    agent.on("awaitingPlanApproval", onAwaitingPlanApproval);
    agent.on("planApproved", onPlanApproved);
    agent.on("planRejected", onPlanRejected);
    agent.on("planAutoApproved", onPlanAutoApproved);
    agent.on("contextMessage", onContextMessage);
    agent.on("thinkingBlock", onThinkingBlock);
    agent.on("planRetrying", onPlanRetrying);
    agent.on("modelWarning", onModelWarning);
    agent.on("todoUpdate", onTodoUpdate);
    agent.on("fileProgress", onFileProgress);
    agent.on("toolOutput", onToolOutput);
    agent.on("done", onDone);
    agent.on("error", onError);

    return () => { 
      agent.off("stepsInit", onStepsInit);
      agent.off("stepUpdate", onStepUpdate);
      agent.off("token", onToken);
      agent.off("toolCall", onToolCall);
      agent.off("toolResult", onToolResult);
      agent.off("permissionRequest", onPermissionRequest);
      agent.off("awaitingPlanApproval", onAwaitingPlanApproval);
      agent.off("planApproved", onPlanApproved);
      agent.off("planRejected", onPlanRejected);
      agent.off("planAutoApproved", onPlanAutoApproved);
      agent.off("contextMessage", onContextMessage);
      agent.off("thinkingBlock", onThinkingBlock);
      agent.off("planRetrying", onPlanRetrying);
      agent.off("modelWarning", onModelWarning);
      agent.off("todoUpdate", onTodoUpdate);
      agent.off("fileProgress", onFileProgress);
      agent.off("toolOutput", onToolOutput);
      agent.off("done", onDone);
      agent.off("error", onError);
      if (flushTimer.current) clearTimeout(flushTimer.current); 
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (watchdogTimer.current) clearInterval(watchdogTimer.current);
      if (elapsedTimer.current) clearInterval(elapsedTimer.current);
      pendingArgCache.current = {};
    };
  }, [agent, scheduleFlush, commitStream]);

  // Watchdog effect \u2014 force reset if stuck for > 5 mins
  useEffect(() => {
    if (isProcessing) {
      if (!processingStartTime.current) processingStartTime.current = Date.now();

      watchdogTimer.current = setInterval(() => {
        const elapsed = Date.now() - (processingStartTime.current ?? Date.now());
        const WATCHDOG_TIMEOUT = 5 * 60 * 1000; // 5 minutes

        if (elapsed > WATCHDOG_TIMEOUT) {
          setIsProcessing(false);
          setIsThinking(false);
          setActiveTool(null);
          setIsExecuting(false);
          processingStartTime.current = null;

          setMessages(prev => [...prev, {
            id: uuidv4(),
            role: "system" as const,
            content: `\u23f1 Watchdog: Agent tidak merespons setelah ${WATCHDOG_TIMEOUT / 60000} menit. State direset otomatis.`,
          }]);

          // Abort current operation
          (agent as any).currentAbortController?.abort();
        }
      }, 10000); // Check every 10s
    } else {
      if (watchdogTimer.current) {
        clearInterval(watchdogTimer.current);
        watchdogTimer.current = null;
      }
      processingStartTime.current = null;
    }

    return () => {
      if (watchdogTimer.current) {
        clearInterval(watchdogTimer.current);
        watchdogTimer.current = null;
      }
    };
  }, [isProcessing, agent]);

  const handleSubmit = useCallback(async (input: string) => {
    const text = input.trim();
    if (!text) return;

    if (text.startsWith("/")) {
        const [cmd, ...args] = text.split(/\s+/);
        if (cmd === "/cm") {
            const newModel = args[0];
            if (newModel) {
                const newConfig = { ...currentConfig, model: newModel };
                setCurrentConfig(newConfig);
                agent.updateConfig(newConfig);
                setMessages(prev => [...prev, { id: uuidv4(), role: "user", content: text }, { id: uuidv4(), role: "system", content: `🚀 Model changed to: ${newModel}` }]);
            }
            return;
        }
        if (cmd === "/thinking") {
            const mode = args[0] as "compact" | "verbose" | "silent";
            if (["compact", "verbose", "silent"].includes(mode)) {
                const newConfig = { ...currentConfig, thinkingMode: mode };
                setCurrentConfig(newConfig);
                agent.updateConfig(newConfig);
                setMessages(prev => [...prev, { id: uuidv4(), role: "user", content: text }, { id: uuidv4(), role: "system", content: `\ud83e\udde0 Thinking mode set to: ${mode}` }]);
            }
            return;
        }
        if (cmd === "/plan") {
            const status = args[0] === "on";
            const newConfig = { ...currentConfig, planMode: status };
            setCurrentConfig(newConfig);
            agent.updateConfig(newConfig);
            setMessages(prev => [...prev, { id: uuidv4(), role: "user", content: text }, { id: uuidv4(), role: "system", content: `\ud83d\udccb Plan mode is now ${status ? "ON" : "OFF"}` }]);
            return;
        }
        if (cmd === "/auto-approve") {
            const status = args[0] === "on";
            const newConfig = { ...currentConfig, autoApproveReadOnly: status };
            setCurrentConfig(newConfig);
            agent.updateConfig(newConfig);
            setMessages(prev => [...prev, { id: uuidv4(), role: "user", content: text }, { id: uuidv4(), role: "system", content: `\u2705 Auto-approve read-only is now ${status ? "ON" : "OFF"}` }]);
            return;
        }
        if (cmd === "/clear") { setMessages([]); return; }
        if (cmd === "/exit") { agent.cleanup(); exit(); process.exit(0); }
        if (cmd === "/help") {
            const helpText = `Available commands:\n` + 
                `/cm <model>          - Change current AI model\n` +
                `/thinking <mode>     - Set mode: compact | verbose | silent\n` +
                `/plan <on|off>       - Enable/disable planning phase\n` +
                `/auto-approve <on|off>- Auto-approve read-only tasks\n` +
                `/clear               - Clear chat history\n` +
                `/exit                - Exit hiru`;
            setMessages(prev => [...prev, { id: uuidv4(), role: "user", content: text }, { id: uuidv4(), role: "system", content: helpText }]);
            return;
        }
    }

    setMessages(prev => [...prev, { id: uuidv4(), role: "user", content: input }]);
    setLastError(null);
    setIsThinking(true); streamRef.current = ""; setStreamingText("");
    setIsProcessing(true);
    
    // Start timers
    processingStartTime.current = Date.now();
    setProcessingElapsedMs(0);
    elapsedTimer.current = setInterval(() => {
        setProcessingElapsedMs(prev => prev + 1000);
    }, 1000);

    try {
        await agent.runStreaming(input, ctx, messages);
    } catch (e: any) {
        const msg = e?.message || String(e);
        setLastError(msg);
        setMessages(prev => [...prev, {
            id: uuidv4(),
            role: "system" as const,
            content: `Error: ${msg}`,
        }]);
    } finally {
        if (elapsedTimer.current) {
            clearInterval(elapsedTimer.current);
            elapsedTimer.current = null;
        }
        setProcessingElapsedMs(0);
        setIsProcessing(false);
        setIsThinking(false);
        setActiveTool(null);
        setIsExecuting(false);
        commitStream();
    }
  }, [agent, ctx, commitStream, currentConfig]);

  // Auto-save session periodically (debounced, not on every token)
  useEffect(() => {
    if (!messages.length) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      // Only save last 30 messages to prevent memory bloat in SQLite
      const msgsToSave = messages.slice(-30);
      saveSession({
        id: sessionId,
        name: `Session @ ${new Date().toLocaleTimeString()}`,
        projectRoot: ctx.root,
        messages: JSON.stringify(msgsToSave),
        tokenUsage: JSON.stringify(agent.tokenUsage),
        createdAt: Date.now(),
        updatedAt: Date.now()
      }).catch(console.error);
    }, 5000);

    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [messages, agent.tokenUsage, sessionId, ctx.root]);

  // Trim UI messages when they exceed limit
  useEffect(() => {
    if (messages.length > MAX_UI_MESSAGES) {
      setMessages(prev => trimMessages(prev));
    }
  }, [messages.length, trimMessages]);

  return (
    <App
      onSubmit={handleSubmit}
      messages={messages}
      activeTool={activeTool}
      isThinking={isThinking}
      isExecuting={isExecuting}
      streamingText={streamingText}
      provider={currentConfig.provider}
      model={currentConfig.model}
      project={ctx.root}
      version={version}
      pendingPermission={pendingPermission}
      pendingPlan={pendingPlan}
      onPlanChoice={async (choice) => {
        if (choice === "approve") {
          setMessages(prev => [...prev, { id: uuidv4(), role: "system", content: "\u2705 Plan Approved" }]);
          setPendingPlan(null);
          await agent.resolvePlanApproval(true);
        } else if (choice === "reject") {
          setMessages(prev => [...prev, { id: uuidv4(), role: "system", content: "\u274c Plan Rejected" }]);
          setPendingPlan(null);
          await agent.resolvePlanApproval(false);
        } else if (choice === "edit") {
          const tempFile = path.join(os.tmpdir(), `hiru-plan-${Date.now()}.txt`);
          fs.writeFileSync(tempFile, pendingPlan.raw || "");
          
          const editor = process.env.EDITOR || (process.platform === 'win32' ? "notepad" : "vi");
          try {
            spawnSync(editor, [tempFile], { stdio: "inherit" });
            
            const editedContent = fs.readFileSync(tempFile, "utf-8");
            if (editedContent.trim()) {
              const newPlan = new PlanParser().parse(editedContent);
              setPendingPlan(newPlan);
            }
          } catch (e) {
            console.error("Failed to open editor:", e);
          } finally {
             if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
          }
        }
      }}
      thinkingState={thinkingState}
      executionSteps={executionSteps}
      currentStepIndex={currentStepIndex}
      todos={todos}
      lastError={lastError}
      isExpanded={isExpanded}
      isProcessing={isProcessing}
      processingElapsedMs={processingElapsedMs}
    />
  );
}
