// src/thinking/ExecutionTracker.tsx
// Tampilkan status tiap langkah saat plan sedang dieksekusi

import React from "react";
import { Box, Text } from "ink";
import { Spinner } from "@inkjs/ui";
import type { ExecutionStep } from "./PlanParser.js";
import { S } from "./symbols.js";

type StepStatus = "pending" | "running" | "done" | "error" | "skipped";

export interface TrackedStep {
  step: ExecutionStep;
  status: StepStatus;
  startedAt?: number;
  finishedAt?: number;
  errorMessage?: string;
  toolCallsMade: number;     // Berapa tool call dibuat untuk step ini
}

interface ExecutionTrackerProps {
  steps: TrackedStep[];
  currentStepIndex: number;
}

const STATUS_ICON: Record<StepStatus, string> = {
  pending: S.pending,
  running: S.running,
  done:    S.done,
  error:   S.error,
  skipped: S.skipped,
};

const STATUS_COLOR: Record<StepStatus, string> = {
  pending: "blackBright",
  running: "yellow",
  done:    "green",
  error:   "red",
  skipped: "blackBright",
};

export function ExecutionTracker({ steps, currentStepIndex }: ExecutionTrackerProps) {
  const completedCount = steps.filter(s => s.status === "done").length;
  const errorCount = steps.filter(s => s.status === "error").length;
  const totalMs = steps
    .filter(s => s.finishedAt && s.startedAt)
    .reduce((sum, s) => sum + (s.finishedAt! - s.startedAt!), 0);

  return (
    <Box flexDirection="column" marginTop={1}>

      {/* Header progress */}
      <Box gap={2}>
        <Text color={completedCount === steps.length ? "green" : "#CC785C"} bold>
          {completedCount === steps.length ? `${S.done} Execution Finished` : `${S.thinking} Executing plan`}
        </Text>
        <Text color="blackBright">
          {completedCount}/{steps.length} steps
        </Text>
        {totalMs > 0 && (
          <Text color="blackBright" dimColor>{(totalMs / 1000).toFixed(1)}s</Text>
        )}
      </Box>

      {/* Step list */}
      <Box flexDirection="column" marginTop={0} paddingLeft={2}>
        {steps.map((tracked, i) => (
          <StepRow
            key={i}
            tracked={tracked}
            isCurrent={i === currentStepIndex}
          />
        ))}
      </Box>

      {/* Summary di akhir */}
      {completedCount === steps.length && (
        <CompletionSummary
          completed={completedCount}
          errors={errorCount}
          totalMs={totalMs}
        />
      )}

    </Box>
  );
}

function StepRow({
  tracked,
  isCurrent,
}: {
  tracked: TrackedStep;
  isCurrent: boolean;
}) {
  const { step, status, startedAt, finishedAt, errorMessage, toolCallsMade } = tracked;
  const color = STATUS_COLOR[status];
  const durationMs = startedAt && finishedAt ? finishedAt - startedAt : null;

  return (
    <Box gap={1} marginTop={0}>

      {/* Status icon */}
      {status === "running" ? (
        <Spinner type="dots" />
      ) : (
        <Text color={color}>{STATUS_ICON[status]}</Text>
      )}

      {/* Step number */}
      <Text color="blackBright">{String(step.number).padStart(2)}.</Text>

      {/* Verb */}
      <Text
        color={status === "done" ? "blackBright" : color}
        bold={status === "running"}
        strikethrough={status === "skipped"}
      >
        {step.verb}
      </Text>

      {/* Target */}
      <Text
        color={status === "done" ? "blackBright" : "white"}
        dimColor={status !== "running"}
        wrap="truncate-end"
      >
        {step.target}
      </Text>

      {/* Tool calls count \u2014 tunjukkan kalau lebih dari 1 */}
      {toolCallsMade > 0 && status === "running" && (
        <Text color="blackBright" dimColor>
          ({toolCallsMade} call{toolCallsMade !== 1 ? "s" : ""})
        </Text>
      )}

      {/* Duration */}
      {durationMs !== null && (
        <Text color="blackBright" dimColor>
          {durationMs > 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`}
        </Text>
      )}

      {/* Error message inline */}
      {status === "error" && errorMessage && (
        <Text color="red" dimColor wrap="truncate-end">
          \u2014 {errorMessage.slice(0, 50)}
        </Text>
      )}

    </Box>
  );
}

function CompletionSummary({
  completed,
  errors,
  totalMs,
}: {
  completed: number;
  errors: number;
  totalMs: number;
}) {
  return (
    <Box marginTop={1} flexDirection="column">
      <Text color="blackBright">{S.dash.repeat(40)}</Text>
      <Box gap={2} paddingLeft={0}>
        <Box gap={1}>
          {errors === 0 ? (
            <>
              <Text color="greenBright">{S.done}</Text>
              <Text color="white">Done</Text>
            </>
          ) : (
            <>
              <Text color="yellow">{S.warning}</Text>
              <Text color="white">{completed - errors} done</Text>
              <Text color="red">{errors} failed</Text>
            </>
          )}
          <Text color="blackBright" dimColor>
            in {(totalMs / 1000).toFixed(1)}s
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
