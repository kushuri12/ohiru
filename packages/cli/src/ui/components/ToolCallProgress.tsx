import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { Spinner } from "@inkjs/ui";
import { BlinkingCursor } from "../messages/AssistantMessage.js";
import { ActiveTool } from "../../types.js";
import { theme } from "../theme.js";
import highlight from "cli-highlight";

const TOOL_LABELS: Record<string, string> = {
  read_file: "Read",
  write_file: "Write",
  edit_file: "Edit",
  create_file: "Write",
  list_files: "List",
  search_files: "Search",
  run_shell: "Run",
  run_tests: "Test",
  git_operation: "Git",
  web_fetch: "Fetch",
  create_directory: "Mkdir",
};

/**
 * ToolCallProgress Component
 * Fix 2C: Implements real-time file write preview using liveLines from FileProgress events.
 * THEME: Now fully using Hiru Brand Orange (theme.accent).
 */
export function ToolCallProgress({ tool, columns, isExpanded }: {
  tool: ActiveTool;
  columns: number;
  isExpanded: boolean;
}) {
  const label = TOOL_LABELS[tool.name] ?? tool.name;
  const input = tool.input || {};
  const isFileWriteOp = tool.name === "write_file" || tool.name === "edit_file" || tool.name === "create_file";
  const isShellOp = tool.name === "run_shell";

  const displayArg = tool.name === "run_shell"
    ? (input.command || input.cmd || "")
    : getProgressMainArg(tool.name, input);

  const maxLen = Math.max(columns - label.length - 25, 20);

  const liveLines: string[] = tool.liveLines || [];
  const liveLinesTotal: number = tool.liveLinesTotal || 0;
  const percent = tool.progress?.percent ?? 0;
  const isComplete = percent === 100;

  const MAX_PREVIEW = isExpanded ? 30 : (isShellOp ? 15 : 12);
  const displayLines = liveLines.slice(-MAX_PREVIEW);
  const hiddenAbove = Math.max(0, liveLines.length - MAX_PREVIEW);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>

      {/* Header: Hiru Orange + Spinner */}
      <Box flexDirection="row" alignItems="center">
        {isComplete
          ? <Text color={theme.success}>✓ </Text>
          : <Spinner type="dots" />
        }
        <Text> </Text>
        <Text color={theme.accent} bold>{label}</Text>
        {displayArg && (
          <Text color={theme.textPrimary} dimColor wrap="truncate-end">
            {` (${displayArg.length > maxLen ? "\u2026" + displayArg.slice(-(maxLen - 1)) : displayArg})`}
          </Text>
        )}
        {isFileWriteOp && (
          <Text color={theme.warning} bold>
            {isComplete
              ? `  ✓ ${liveLinesTotal} lines`
              : `  ${liveLines.length}/${liveLinesTotal > 0 ? liveLinesTotal : "?"} lines`}
          </Text>
        )}
        <ElapsedTimer startTime={tool.startTime} />
      </Box>

      {/* Progress Bar (Visual Orange) */}
      {isFileWriteOp && percent > 0 && (
        <Box marginLeft={3} marginTop={0}>
          <ProgressBar percent={percent} width={24} />
          <Text color={theme.textPrimary} bold> {percent}%</Text>
          {tool.progress?.speed && (
            <Text color={theme.success}>  {tool.progress.speed}</Text>
          )}
          {tool.progress?.eta != null && tool.progress.eta > 0 && (
            <Text color={theme.accent}>  ETA: {tool.progress.eta}s</Text>
          )}
        </Box>
      )}

      {/* LIVE PREVIEW BOX: Brand Orange Borders! */}
      {(isFileWriteOp || isShellOp) && (
        <Box
          flexDirection="column"
          marginLeft={3}
          marginTop={1}
          borderStyle="single"
          borderColor={isComplete ? theme.success : theme.accent}
          paddingX={1}
        >
          {/* Header Preview */}
          <Box flexDirection="row" justifyContent="space-between" marginBottom={0}>
            <Text color={isComplete ? theme.success : theme.accent} bold italic>
              {isFileWriteOp 
                ? (isComplete ? "\u2713 Document saved" : "\u2193 Writing to disk...")
                : (isComplete ? "\u2713 Command completed" : "\u2193 Executing... (streaming logs)")}
            </Text>
            {isFileWriteOp && (
              <Text color={theme.textMuted} dimColor>
                {liveLines.length}/{liveLinesTotal > 0 ? liveLinesTotal : "?"} lines
              </Text>
            )}
          </Box>

          {hiddenAbove > 0 && (
            <Text color={theme.textMuted} dimColor italic>
              \u2191 {hiddenAbove} earlier lines hidden (ctrl+e to expand)
            </Text>
          )}
          {/* Realtime Content */}
          {liveLines.length > 0 ? (
    displayLines.map((line: string, i: number) => {
      const isLastLine = i === displayLines.length - 1;
      const lineNumber = liveLines.length - displayLines.length + i + 1;
      
      // Syntax Highlighting for file content (Premium Hack)
      let highlightedLine = line;
      if (isFileWriteOp && displayArg.includes(".")) {
        try {
          const ext = displayArg.split(".").pop() || "js";
          // Use safer call
          highlightedLine = (highlight as any)(line, { language: ext });
        } catch (e) {
          // Fallback to plain line if highlighting fails
        }
      }

      return (
        <Box key={i} flexDirection="row">
                  {isFileWriteOp && (
                    <Box width={5}>
                      <Text color={theme.textMuted} dimColor>{String(lineNumber).padStart(4)} </Text>
                    </Box>
                  )}
                  <Text color={theme.textPrimary} dimColor={!isShellOp} wrap="truncate-end">
                    {highlightedLine}
                  </Text>
                  {isLastLine && !isComplete && <BlinkingCursor />}
                </Box>
              );
            })
          ) : (
            <Box flexDirection="row">
              {isFileWriteOp && (
                <Box width={5}>
                   <Text color={theme.textMuted} dimColor>   1 </Text>
                </Box>
              )}
              <BlinkingCursor />
            </Box>
          )}
        </Box>
      )}

      <SlowProgressWrapper startTime={tool.startTime} toolName={tool.name} />
    </Box>
  );
}

function getProgressMainArg(toolName: string, input: Record<string, any>): string {
  const KEY_PRIORITY: Record<string, string[]> = {
    write_file:  ["path", "file_path", "filename"],
    read_file:   ["path", "file_path", "filename"],
    edit_file:   ["path", "file_path", "filename"],
    create_file: ["path", "file_path", "filename"],
    list_files:  ["path", "directory", "dir"],
    run_shell:   ["command", "cmd"],
  };

  const keys = KEY_PRIORITY[toolName] ?? Object.keys(input);
  for (const key of keys) {
    if (input[key]) return String(input[key]);
  }
  return "";
}

function ProgressBar({ percent, width = 30 }: { percent: number; width?: number }) {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const bar = `█`.repeat(filled) + `░`.repeat(empty);
  return <Text color={theme.accent}>{bar}</Text>;
}

function SlowProgressWrapper({ startTime, toolName }: { startTime: number; toolName: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);
    return () => clearInterval(timer);
  }, [startTime]);

  const WARN_THRESHOLD = toolName === "run_shell" ? 30_000 : 15_000;
  if (elapsed < WARN_THRESHOLD) return null;

  return (
    <Box paddingLeft={3}>
      <Text color={theme.warning} dimColor italic>
        ⚠ Process taking longer than expected ({(elapsed / 1000).toFixed(0)}s)
      </Text>
    </Box>
  );
}

function ElapsedTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 100);
    return () => clearInterval(timer);
  }, [startTime]);

  const seconds = (elapsed / 1000).toFixed(1);
  return <Text color={theme.textMuted} dimColor>{`  ${seconds}s`}</Text>;
}
