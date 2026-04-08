import React from "react";
import { Box, Text } from "ink";

const TOOL_LABELS: Record<string, string> = {
  read_file:        "Read",
  write_file:       "Write",
  edit_file:        "Edit",
  create_file:      "Write",
  delete_file:      "Delete",
  list_files:       "List",
  search_files:     "Search",
  run_shell:        "Run",
  run_tests:        "Test",
  git_operation:    "Git",
  web_fetch:        "Fetch",
  ask_user:         "Ask",
  create_directory: "Mkdir",
};

const KEY_PRIORITY: Record<string, string[]> = {
  write_file:       ["path", "file_path", "filename", "filepath", "file", "name"],
  read_file:        ["path", "file_path", "filename", "filepath", "file"],
  edit_file:        ["path", "file_path", "filename", "filepath", "file"],
  create_file:      ["path", "file_path", "filename", "filepath", "file"],
  delete_file:      ["path", "file_path", "filename", "filepath", "file"],
  list_files:       ["path", "directory", "dir", "folder"],
  search_files:     ["pattern", "query", "search", "regex"],
  run_shell:        ["command", "cmd", "shell_command"],
  run_tests:        ["test_path", "path", "file", "pattern"],
  git_operation:    ["operation", "action", "command"],
  web_fetch:        ["url", "uri", "link", "href"],
  ask_user:         ["question", "prompt", "message", "text"],
  create_directory: ["path", "dir", "directory", "folder"],
};

function getMainArg(toolName: string, input: Record<string, any>): string | null {
  if (!input || typeof input !== "object") return "";
  
  const keys = KEY_PRIORITY[toolName];
  if (keys) {
    for (const key of keys) {
      const val = input[key];
      if (val != null && String(val).trim() !== "") {
        return String(val);
      }
    }
  }

  // Fallback: guess from available keys
  const guessOrder = ["path", "file", "url", "command", "query"];
  for (const hint of guessOrder) {
    const matchKey = Object.keys(input).find(k => k.toLowerCase().includes(hint));
    if (matchKey && input[matchKey]) return String(input[matchKey]);
  }

  // Last resort: first string value
  for (const val of Object.values(input)) {
    if (typeof val === "string" && val.trim()) return val;
  }

  return "process";
}

function getLineCount(input: any): number | null {
  if (input?.content) return input.content.split("\n").length;
  if (input?.edits) {
    return input.edits.reduce((acc: number, e: any) => acc + (e.new_string?.split("\n").length || 0), 0);
  }
  return null;
}

function ShellOutputBox({
  content,
  isError,
  toolName,
  columns,
  isExpanded,
}: {
  content: string;
  isError: boolean;
  toolName: string;
  columns: number;
  isExpanded: boolean;
}) {
  // Parse format baru [SUCCESS]/[ERROR] dari tool output
  const isFormattedError   = content.startsWith("[ERROR]");
  const isFormattedSuccess = content.startsWith("[SUCCESS]");
  const isBlocked          = content.startsWith("[BLOCKED]");
  const isTimeout          = content.startsWith("[TIMEOUT]");
  const isCommandMarker    = content.startsWith("[COMMAND]");

  const actuallyError = isError || isFormattedError || isTimeout;
  const borderColor   = actuallyError ? "red"
                      : isBlocked     ? "yellow"
                      : "blackBright";

  const headerLabel = isFormattedError   ? "ERROR"
                    : isFormattedSuccess  ? "OK"
                    : isBlocked          ? "BLOCKED"
                    : isTimeout          ? "TIMEOUT"
                    : isError            ? "FAILED"
                    : "OUTPUT";

  const headerColor = actuallyError ? "red"
                    : isBlocked     ? "yellow"
                    : "green";

  // Bersihkan ANSI escape codes
  const stripAnsi = (str: string) =>
    str.replace(
      /[\u001b\u009b][[()#;?]*(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~]*)*)?(?:\u0007|(?:\u001b|\u009b)\\)/g,
      ""
    );

  // Filter baris yang tidak berguna
  const isNoiseLine = (line: string): boolean => {
    const clean = line.trim();
    if (clean.length === 0) return true;
    // Progress bars
    if (/[#=\-]{8,}/.test(clean)) return true;
    if (/^\[[\d\s]+\]$/.test(clean)) return true;
    // Marker lines yang sudah kita parse
    if ([ "[OUTPUT]", "[PARTIAL OUTPUT]", "[COMMAND]", "[FATAL ERROR]" ].some(p => clean.startsWith(p))) return true;
    if (clean.startsWith("[ERROR] Command finished with issues")) return true;
    if (clean.startsWith("[SUCCESS] exit")) return true;
    
    return false;
  };

  // Max lines berdasarkan tipe
  let maxLines = actuallyError ? 20 : isFormattedSuccess ? 8 : 10;
  if (isExpanded) maxLines = 100; // Show a lot more when expanded

  const lines = content
    .split("\n")
    .map(l => stripAnsi(l))
    .filter(l => !isNoiseLine(l))
    // Dedup
    .filter((l, i, arr) => i === 0 || l !== arr[i - 1]);

  const display   = lines.slice(0, maxLines);
  const remaining = lines.length - maxLines;

  return (
    <Box
      flexDirection="column"
      marginLeft={3}
      marginTop={0}
      marginBottom={1}
    >
      {/* Header bar */}
      <Box flexDirection="row" gap={1}>
        <Text color={headerColor} bold>[{headerLabel}]</Text>
        {(isFormattedSuccess || isFormattedError) && (
          <Text color="blackBright" dimColor>
            {/* Ekstrak exit code kalau ada */}
            {content.match(/\[EXIT CODE\] (\d+)/)?.[1]
              ? `exit ${content.match(/\[EXIT CODE\] (\d+)/)?.[1]}`
              : content.match(/exit (\d+)/)?.[1] 
                ? `exit ${content.match(/exit (\d+)/)?.[1]}`
                : ""}
          </Text>
        )}
      </Box>

      {/* Output lines dalam box */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={borderColor}
        paddingX={1}
        paddingY={0}
      >
        {display.length === 0 ? (
          <Text color="blackBright" dimColor italic>(no output)</Text>
        ) : (
          display.map((line, i) => (
            <Text
              key={i}
              color={actuallyError ? "red" : "white"}
              dimColor={!actuallyError && !isFormattedError && !isFormattedSuccess}
              wrap="truncate-end"
            >
              {line}
            </Text>
          ))
        )}

        {remaining > 0 && (
          <Text color="blackBright" dimColor italic>
            \u2026 {remaining} more line{remaining !== 1 ? "s" : ""} hidden {!isExpanded ? "(ctrl+e to expand)" : ""}
          </Text>
        )}
      </Box>

      {/* Action hint untuk error */}
      {actuallyError && (
        <Box marginTop={0}>
          <Text color="yellow" dimColor>
            ↳ Agent will attempt to fix this automatically
          </Text>
        </Box>
      )}
    </Box>
  );
}

export function ToolCallBlock({ call, result, columns, isExpanded }: { call: any; result: any; columns: number; isExpanded: boolean }) {
  const label = TOOL_LABELS[call.name] ?? call.name;
  const input = call.input || {};
  const mainArg = getMainArg(call.name, input);
  const lineCount = getLineCount(input);
  const hasResult = result !== undefined && result !== null;
  const isError = !!result?.isError;
  const maxArgLen = Math.max(columns - label.length - 25, 20);

  let resultContent = "";
  if (hasResult) {
    const raw = result.result ?? result.content ?? "";
    if (Array.isArray(raw)) {
      resultContent = raw.map(i => String(i)).join("\n");
    } else if (typeof raw === 'object') {
      resultContent = JSON.stringify(raw, null, 2);
    } else {
      resultContent = String(raw);
    }
  }

  // Tentukan kapan harus tampilkan output (Fix Masalah 3A)
  const shouldShowOutput = hasResult && resultContent.trim() && (
    // Selalu tampil untuk run_shell
    call.name === "run_shell" ||
    // Tampil untuk error apapun
    isError ||
    resultContent.startsWith("[ERROR]") ||
    // Tampil kalau output punya content bermakna (bukan hanya "Done")
    (resultContent.length > 10 && resultContent !== "Done" && !resultContent.includes("Successfully applied"))
  );

  const previewLines = (input.content || "").split("\n").slice(0, 10);
  const hasMoreLines = (input.content || "").split("\n").length > 10;

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={shouldShowOutput ? 1 : 0}>
      <Box flexDirection="row">
        <Box width={2} marginRight={1}>
           <Text color={isError || resultContent.startsWith("[ERROR]") ? "red" : (hasResult ? "green" : "yellow")}>•</Text>
        </Box>
        <Box>
          <Text color="white" bold>{label}</Text>
          <Text color="white" wrap="truncate-end">
            {mainArg ? ` (${mainArg.length > maxArgLen ? "…" + mainArg.slice(-(maxArgLen - 1)) : mainArg})` : " (process)"}
          </Text>
          {lineCount !== null && (
             <Text color="blackBright">{` [${lineCount} lines]`}</Text>
          )}
        </Box>
      </Box>

      {/* Code Preview for write_file */}
      {call.name === "write_file" && input.content && (
        <Box flexDirection="column" marginLeft={3} borderStyle="single" borderColor="blackBright" paddingX={1}>
          {previewLines.map((line: string, i: number) => (
            <Text key={i} color="white" dimColor wrap="truncate-end">{line}</Text>
          ))}
          {(hasMoreLines || isExpanded) && !isExpanded && (
            <Text color="blackBright" italic>... (ctrl+e to expand)</Text>
          )}
          {isExpanded && input.content.split("\n").slice(10).map((line: string, i: number) => (
            <Text key={i} color="white" dimColor wrap="truncate-end">{line}</Text>
          ))}
        </Box>
      )}

      {shouldShowOutput && (
        <ShellOutputBox
          content={resultContent}
          isError={isError}
          toolName={call.name}
          columns={columns}
          isExpanded={isExpanded}
        />
      )}
    </Box>
  );
}
