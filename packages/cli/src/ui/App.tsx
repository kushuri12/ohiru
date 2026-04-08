import React, { useState, useEffect } from "react";
import { Box, Text, Static } from "ink";
import { InputArea } from "./components/InputArea.js";
import { ToolCallProgress } from "./components/ToolCallProgress.js";
import { SlashCommandMenu } from "./components/SlashCommandMenu.js";
import { UserMessage } from "./messages/UserMessage.js";
import { AssistantMessage } from "./messages/AssistantMessage.js";
import { ToolCallBlock } from "./messages/ToolCallBlock.js";
import { ThinkingIndicator } from "./messages/ThinkingIndicator.js";
import { 
  ReasoningDisplay, 
  PlanPresenter, 
  ExecutionTracker 
} from "../thinking/index.js";
import { S } from "../thinking/symbols.js";
import { theme } from "./theme.js";
import { TodoItem } from "../agent/TodoTracker.js";
import { SPINNER_VERBS, FIGURES } from "./constants.js";

interface AppProps {
  onSubmit: (input: string) => void;
  messages: any[];
  activeTool: any | null;
  isThinking: boolean;
  streamingText: string;
  provider: string;
  model: string;
  project: string;
  version: string;
  pendingPermission: { toolName: string; args: any } | null;
  pendingPlan?: any;
  onPlanChoice?: (choice: string) => void;
  thinkingState?: any;
  executionSteps?: any[];
  currentStepIndex?: number;
  isExecuting?: boolean;
  lastError?: string | null;
  todos?: TodoItem[];
  isExpanded: boolean;
  isProcessing: boolean;
  processingElapsedMs?: number;
}

export function App({
  onSubmit,
  messages,
  activeTool,
  isThinking,
  streamingText,
  provider,
  model,
  project,
  version,
  pendingPermission,
  pendingPlan,
  onPlanChoice,
  thinkingState,
  executionSteps,
  currentStepIndex,
  isExecuting,
  lastError,
  todos,
  isExpanded,
  isProcessing,
  processingElapsedMs = 0
}: AppProps) {
  const [inputValue, setInputValue] = useState("");
  const columns = process.stdout.columns || 80;
  const showMenu = inputValue.startsWith("/");

  return (
    <>

      {/* 1. MESSAGE HISTORY (Scrollable) */}
      <Box flexDirection="column" paddingX={0}>
        {messages.map((msg: any) => {
          switch (msg.role) {
            case "user":
              return <UserMessage key={msg.id} content={msg.content} columns={columns} />;
            case "assistant":
              return <AssistantMessage key={msg.id} content={msg.content} isStreaming={false} columns={columns} />;
            case "tool_call":
              return <ToolCallBlock key={msg.id} call={msg.toolCall} result={msg.toolResult} columns={columns} isExpanded={isExpanded} />;
            case "system":
              return (
                <Box key={msg.id} marginTop={0} marginBottom={0} paddingX={1}>
                  <Text color={theme.error}> {msg.content}</Text>
                </Box>
              );
            default:
              return null;
          }
        })}
      </Box>

      {/* 2. DYNAMIC UI */}
      <Box flexDirection="column" paddingX={0}>
        {streamingText && (
          <AssistantMessage content={streamingText} isStreaming={true} columns={columns} />
        )}
        
        {thinkingState && (
          <ReasoningDisplay 
            sections={thinkingState.sections}
            isThinking={isThinking}
            toolCallsCount={thinkingState.toolCallsCount}
            elapsedMs={thinkingState.elapsedMs}
            isExpanded={isExpanded}
          />
        )}

        {pendingPlan && onPlanChoice && (
          <PlanPresenter 
            plan={pendingPlan}
            onChoice={(choice) => onPlanChoice(choice)}
          />
        )}

        {/* Task Progress (Planned Steps) */}
        {executionSteps && executionSteps.length > 0 && (
          <ExecutionTracker 
            steps={executionSteps}
            currentStepIndex={currentStepIndex ?? 0}
          />
        )}

        {/* Current Active Tool Progress */}
        {activeTool && (
          <ToolCallProgress 
            tool={activeTool} 
            columns={columns} 
            isExpanded={isExpanded} 
          />
        )}

        {/* Dynamic Tools (Activity - Only if no plan steps) */}
        {!executionSteps?.length && todos && todos.length > 0 && (
          <Box flexDirection="column" marginTop={1} paddingX={1}>
            <Text color={theme.textMuted} bold> Activity</Text>
            {todos.map((todo) => {
              const icon = todo.status === "done" ? S.done
                        : todo.status === "error" ? S.error
                        : todo.status === "running" ? S.running
                        : S.pending;
              const color = todo.status === "done" ? theme.success
                          : todo.status === "error" ? theme.error
                          : todo.status === "running" ? theme.info
                          : theme.textMuted;
              return (
                <Box key={todo.toolCallId} flexDirection="row">
                  <Text color={color}> {icon} </Text>
                  <Text color={color} dimColor={todo.status === "done"}>{todo.label}</Text>
                </Box>
              );
            })}
          </Box>
        )}

        {lastError && (
          <Box borderStyle="single" borderColor={theme.error} paddingX={1} marginTop={1}>
            <Text color={theme.error} bold>ERROR: </Text>
            <Text color={theme.textPrimary}>{lastError}</Text>
          </Box>
        )}

        {pendingPermission && (
          <Box flexDirection="column" borderStyle="round" borderColor={theme.warning} paddingX={2} marginTop={1}>
            <Text color={theme.warning} bold>PERMISSION REQUIRED: </Text>
            <Box>
               <Text>Run</Text>
               <Text> </Text>
               <Text color={theme.info} bold>{pendingPermission.toolName}</Text>
            </Box>
            <Box marginTop={1}>
              <Text bold>Allow?</Text>
              <Text> </Text>
              <Text color={theme.success} bold>(y) Yes</Text>
              <Text> </Text>
              <Text color={theme.textMuted}>/</Text>
              <Text> </Text>
              <Text color={theme.error} bold>(n) No</Text>
            </Box>
          </Box>
        )}
      </Box>

      {/* 3. FOOTER / PROJECT STATUS BAR (Persistent) */}
      {/* 3. PROJECT BAR (Thin, Premium) */}
      <Box 
        flexDirection="row" 
        backgroundColor={isProcessing ? "#333" : "black"} 
        paddingX={1} 
        justifyContent="space-between"
      >
        <Box gap={1}>
          <Text color={theme.accent} bold>Hiru</Text>
          <Text color="blackBright">{project.split(/[\\/]/).pop()}</Text>
        </Box>
        
        <Box gap={2}>
           <Box>
             <StatusText 
               isThinking={isThinking} 
               isExecuting={isExecuting} 
               activeTool={!!activeTool} 
               streamingText={!!streamingText} 
               isAwaiting={!!pendingPlan || !!pendingPermission}
               isProcessing={isProcessing}
             />
           </Box>
           {isProcessing && processingElapsedMs > 0 && (
             <Text color="white" bold>
               [{ (processingElapsedMs / 1000).toFixed(1) }s]
             </Text>
           )}
        </Box>
      </Box>

        {/* Action Area */}
        <Box paddingX={1} flexDirection="column" marginTop={1}>
          {showMenu && !pendingPermission && <SlashCommandMenu filter={inputValue.split(/\s+/)[0]} />}
          
          <Box paddingX={1} flexDirection="column">
            {pendingPermission || pendingPlan ? (
              <Box borderStyle="round" borderColor={pendingPlan ? theme.accent : theme.warning} paddingX={1} width="100%">
                 <Text color={pendingPlan ? theme.accent : theme.warning} bold> 
                   <Text>{pendingPlan ? ` ${S.right} Plan Approval: Press (y) to proceed, (n) to cancel, (e) to edit` : ` ${S.right} Waiting for permission (y/n)...`}</Text>
                 </Text>
              </Box>
            ) : (
              <>
                {/* Preparing Response Indicator */}
                {isProcessing && !streamingText && !activeTool && !isThinking && (
                  <Box paddingX={1} marginBottom={1}>
                    <Text color="cyan" italic dimColor> {S.running} Hiru is analyzing the context and preparing steps...</Text>
                  </Box>
                )}
                {/* Task Completed Banner */}
                {!isProcessing && !isThinking && !activeTool && !isExecuting && messages.length > 0 && messages[messages.length-1].role === "assistant" && (
                  <Box backgroundColor={theme.accent} paddingX={2} marginBottom={1} justifyContent="center">
                    <Text color="white" bold> {S.done} Task Completed Successfully </Text>
                  </Box>
                )}
                <InputArea 
                  onSubmit={onSubmit} 
                  onChange={setInputValue}
                  disabled={isProcessing || isThinking || !!activeTool || !!pendingPlan || !!pendingPermission || isExecuting}
                  processingElapsedMs={processingElapsedMs}
                />
              </>
            )}
          </Box>
        </Box>
    </>
  );
}


function StatusText({ isThinking, isExecuting, activeTool, streamingText, isAwaiting, isProcessing }: any) {
  const [verb, setVerb] = useState("Thinking");
  const [elapsed, setElapsed] = useState(0);
  
  useEffect(() => {
    let interval: any;
    if (isThinking || isExecuting || activeTool || streamingText || isAwaiting || isProcessing) {
      interval = setInterval(() => {
        setElapsed(prev => prev + 1);
        if (Math.random() < 0.3) {
          const next = SPINNER_VERBS[Math.floor(Math.random() * SPINNER_VERBS.length)];
          setVerb(next);
        }
      }, 500);
    } else {
      setElapsed(0);
      setVerb("Idle");
    }
    return () => clearInterval(interval);
  }, [isThinking, isExecuting, activeTool, streamingText, isAwaiting, isProcessing]);

  if (isAwaiting) return <Text color={theme.warning} bold>Waiting for you...</Text>;
  
  if (isThinking || isExecuting || activeTool || streamingText || isProcessing) {
    return (
      <Box>
        <Text color={theme.accent} bold>{verb} </Text>
        <Text color="blackBright">({ (elapsed * 0.5).toFixed(1) }s)</Text>
      </Box>
    );
  }
  
  return <Text color={theme.textMuted} bold>Idle</Text>;
}
