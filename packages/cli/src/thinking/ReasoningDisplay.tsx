// packages/cli/src/thinking/ReasoningDisplay.tsx \u2014 VERSI PERBAIKAN

import React from "react";
import { Box, Text } from "ink";
import { Spinner } from "@inkjs/ui";
import { SYMBOLS } from "./symbols.js";
import type { ParsedSection, SectionName } from "./SectionParser.js";

// Config per section
const SECTION_CONFIG: Record<
  SectionName,
  {
    icon: string;
    label: string;
    color: string;
  }
> = {
  EXPLORE: { icon: SYMBOLS.explore, label: "Exploring", color: "cyan" },
  ANALYZE: { icon: SYMBOLS.analyze, label: "Analyzing", color: "yellow" },
  EVALUATE: {
    icon: SYMBOLS.evaluate,
    label: "Evaluating options",
    color: "#CC785C",
  },
  DECIDE: { icon: SYMBOLS.decide, label: "Decision", color: "greenBright" },
  PLAN: { icon: SYMBOLS.planIcon, label: "Planning", color: "white" },
  RISK: { icon: SYMBOLS.risk, label: "Checking risks", color: "red" },
  SELESAI: { icon: SYMBOLS.done, label: "Done thinking", color: "green" },
  DONE: { icon: SYMBOLS.done, label: "Done thinking", color: "green" },
  SUMMARY: { icon: SYMBOLS.done, label: "Summary", color: "white" },
};

interface ReasoningDisplayProps {
  sections: ParsedSection[];
  isThinking: boolean; // Masih streaming?
  toolCallsCount: number;
  elapsedMs: number;
  isExpanded: boolean;
}

export function ReasoningDisplay({
  sections,
  isThinking,
  toolCallsCount,
  elapsedMs,
  isExpanded,
}: ReasoningDisplayProps) {
  return (
    <Box flexDirection="column" marginTop={1} marginBottom={0}>
      {/* Header baris \u2014 "hiru is thinking..." */}
      <Box flexDirection="row" gap={1}>
        <Text color="#CC785C" bold>
          hiru
        </Text>
        {isThinking ? (
          <Spinner type="dots" />
        ) : (
          <Text color="green">{SYMBOLS.done}</Text>
        )}
        <Text color="white">
          {isThinking ? "thinking\u2026" : "thought for"}{" "}
          {formatElapsed(elapsedMs)}
        </Text>
        {toolCallsCount > 0 && (
          <Text color="white" dimColor>
            \u00b7 {toolCallsCount} file{toolCallsCount !== 1 ? "s" : ""} read
          </Text>
        )}
        {!isExpanded && (
          <Text color="blackBright" dimColor italic>  (ctrl+e to expand)</Text>
        )}
      </Box>

      {/* Sections */}
      {sections &&
        sections.map((section, i) => (
          <SectionRow
            key={i}
            section={section}
            isLast={i === sections.length - 1 && !isThinking}
            isExpanded={isExpanded}
          />
        ))}
    </Box>
  );
}

function SectionRow({
  section,
  isLast,
  isExpanded,
}: {
  section: ParsedSection;
  isLast: boolean;
  isExpanded: boolean;
}) {
  const config = SECTION_CONFIG[section.name] ?? {
    icon: SYMBOLS.bullet,
    label: section.name,
    color: "white",
  };

  // Compact: hanya baris pertama dari konten, Expanded: semua baris
  const lines = section.content
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  
  const firstLine = lines[0] ?? "";
  const otherLines = lines.slice(1);

  const truncated =
    firstLine.length > 72 && !isExpanded ? firstLine.slice(0, 72) + "\u2026" : firstLine;

  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Box flexDirection="row" gap={1}>
        {/* Done marker */}
        <Text color={isLast ? config.color : "blackBright"}>{SYMBOLS.done}</Text>

        {/* Icon */}
        <Text color={config.color}>{config.icon}</Text>

        {/* Content preview */}
        <Text color="white" wrap="truncate-end">
          {truncated}
        </Text>
      </Box>
      {isExpanded && otherLines.length > 0 && (
        <Box flexDirection="column" paddingLeft={4}>
          {otherLines.map((line, i) => (
            <Text key={i} color="white" dimColor wrap="truncate-end">
              {line}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}
