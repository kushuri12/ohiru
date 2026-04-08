// src/thinking/PlanPresenter.tsx
// Komponen Ink untuk menampilkan plan dan menunggu konfirmasi user

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ParsedPlan, ExecutionStep, AffectedFile } from "./PlanParser.js";
import { S } from "./symbols.js";

type UserChoice = "approve" | "reject" | "edit" | "detail";

interface PlanPresenterProps {
  plan: ParsedPlan;
  onChoice: (choice: UserChoice, editedPlan?: string) => void;
}

export function PlanPresenter({ plan, onChoice }: PlanPresenterProps) {
  const [selected, setSelected] = useState<"y" | "n" | "e" | "?">("y");
  const [showDetail, setShowDetail] = useState(false);

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setSelected(prev => {
        const opts = ["y", "n", "e", "?"] as const;
        const idx = opts.indexOf(prev);
        return opts[Math.max(0, idx - 1)];
      });
    }
    if (key.downArrow || input === "j") {
      setSelected(prev => {
        const opts = ["y", "n", "e", "?"] as const;
        const idx = opts.indexOf(prev);
        return opts[Math.min(opts.length - 1, idx + 1)];
      });
    }

    // Shortcut langsung
    if (input === "y" || input === "Y") onChoice("approve");
    if (input === "n" || input === "N") onChoice("reject");
    if (input === "e" || input === "E") onChoice("edit");
    if (input === "?") setShowDetail(d => !d);

    if (key.return) {
      if (selected === "y") onChoice("approve");
      if (selected === "n") onChoice("reject");
      if (selected === "e") onChoice("edit");
      if (selected === "?") setShowDetail(d => !d);
    }
  });

  return (
    <Box flexDirection="column" marginY={1}>

      {/* DIVIDER */}
      <Box>
        <Text color="blackBright">{S.dash.repeat(56)}</Text>
      </Box>

      {/* HEADER */}
      <Box marginTop={0} gap={1}>
        <Text color="#CC785C" bold>{S.plan} Plan</Text>
        <ConfidenceBadge level={plan.confidence} />
        {plan.isDestructive && (
          <Text color="red" bold>{S.warning} destructive</Text>
        )}
      </Box>

      {/* \u2500\u2500 GOAL \u2500\u2500 */}
      <Box marginTop={0} paddingLeft={2}>
        <Text color="white">{plan.goal}</Text>
      </Box>

      {/* \u2500\u2500 STEPS \u2500\u2500 */}
      <Box flexDirection="column" marginTop={1} paddingLeft={2}>
        {plan.steps.map(step => (
          <StepLine key={step.number} step={step} />
        ))}
      </Box>

      {/* \u2500\u2500 FILES AFFECTED (hanya kalau ada perubahan) \u2500\u2500 */}
      {plan.filesAffected.filter(f => f.operation !== "read-only").length > 0 && (
        <Box flexDirection="column" marginTop={1} paddingLeft={2}>
          <Text color="blackBright">Files:</Text>
          {plan.filesAffected
            .filter(f => f.operation !== "read-only")
            .map((file, i) => (
              <FileChangeRow key={i} file={file} />
            ))}
        </Box>
      )}

      {/* \u2500\u2500 DETAIL (toggle dengan ?) \u2500\u2500 */}
      {showDetail && (
        <Box flexDirection="column" marginTop={1} paddingLeft={2}>
          {plan.assumptions.length > 0 && (
            <>
              <Text color="blackBright">Assumptions:</Text>
              {plan.assumptions.map((a, i) => (
                <Box key={i}>
                  <Text color="blackBright">  {S.bullet} </Text>
                  <Text color="blackBright" dimColor>{a}</Text>
                </Box>
              ))}
            </>
          )}
          {plan.risks.length > 0 && (
            <>
              <Text color="blackBright">Risks:</Text>
              {plan.risks.map((r, i) => (
                <Box key={i}>
                  <Text color="yellow">  {S.warning} </Text>
                  <Text color="yellow" dimColor>{r}</Text>
                </Box>
              ))}
            </>
          )}
        </Box>
      )}

      {/* DIVIDER */}
      <Box marginTop={1}>
        <Text color="blackBright">{S.dash.repeat(56)}</Text>
      </Box>

      {/* \u2500\u2500 CHOICE BUTTONS \u2500\u2500 */}
      <Box flexDirection="row" gap={3} paddingX={2} marginTop={1}>
        <Box>
            <Text color="green" bold>(y)</Text>
            <Text> </Text>
            <Text color="white">proceed</Text>
        </Box>
        <Box>
            <Text color="red" bold>(n)</Text>
            <Text> </Text>
            <Text color="white">cancel</Text>
        </Box>
        <Box>
            <Text color="yellow" bold>(e)</Text>
            <Text> </Text>
            <Text color="white">edit</Text>
        </Box>
        <Box>
            <Text color="cyan" bold>(?)</Text>
            <Text> </Text>
            <Text color="white">details</Text>
        </Box>
      </Box>

    </Box>
  );
}

// \u2500\u2500 SUB-KOMPONEN \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function StepLine({ step }: { step: ExecutionStep }) {
  return (
    <Box gap={1}>
      <Text color="blackBright">{String(step.number).padStart(2, " ")}.</Text>

      {/* Verb dengan warna sesuai tipe */}
      <Text
        color={step.isDestructive ? "red" : "white"}
        bold={step.isDestructive}
      >
        {step.verb}
      </Text>

      {/* Target \u2014 file path lebih redup */}
      <FilePath path={step.target} />

      <Text color="blackBright">{"\u2014"}</Text>

      {/* Alasan */}
      <Text color="blackBright" dimColor>{step.reason}</Text>

      {/* Badge destructive */}
      {step.isDestructive && (
        <Text color="red" dimColor>{"[!]"}</Text>
      )}
    </Box>
  );
}

function FileChangeRow({ file }: { file: AffectedFile }) {
  const opColors: Record<string, string> = {
    create:    "green",
    modify:    "yellow",
    delete:    "red",
    "read-only": "blackBright",
  };
  const opSymbols: Record<string, string> = {
    create:    "+",
    modify:    "~",
    delete:    "-",
    "read-only": S.bullet,
  };

  return (
    <Box gap={1}>
      <Text color={opColors[file.operation] ?? "white"}>
        {opSymbols[file.operation] ?? S.bullet}
      </Text>
      <FilePath path={file.path} />
      <Text color="blackBright" dimColor>[{file.operation}]</Text>
    </Box>
  );
}

function FilePath({ path }: { path: string }) {
  const parts = path.split("/");
  const filename = parts.pop() ?? path;
  const dir = parts.length > 0 ? parts.join("/") + "/" : "";

  return (
    <>
      {dir && <Text color="blackBright">{dir}</Text>}
      <Text color="white">{filename}</Text>
    </>
  );
}

function ConfidenceBadge({ level }: { level: "high" | "medium" | "low" }) {
  const config = {
    high:   { label: "confident",  color: "green"  },
    medium: { label: "unsure",     color: "yellow" },
    low:    { label: "speculative",color: "red"    },
  };
  const { label, color } = config[level];
  return <Text color={color} dimColor>[{label}]</Text>;
}

function ChoiceButton({
  label, value, selected
}: {
  label: string; value: string; selected: string;
}) {
  const isSelected = selected === value;
  return (
    <Box>
      {isSelected
        ? <Text color="#CC785C" bold>{"\u203a "}{label}</Text>
        : <Text color="blackBright">{"  "}{label}</Text>
      }
    </Box>
  );
}
