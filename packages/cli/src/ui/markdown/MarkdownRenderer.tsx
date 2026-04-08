import React from "react";
import { Box, Text } from "ink";
import { CodeBlock } from "./CodeBlock.js";

export function renderMarkdownToInk(content: string, columns: number): React.ReactNode[] {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim() || "text";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      const code = codeLines.join("\n");
      elements.push(
        <CodeBlock key={key++} code={code} language={lang} columns={columns} />
      );
      i++;
      continue;
    }

    if (line.startsWith("# ")) {
      elements.push(
        <Box key={key++} marginTop={1} marginBottom={0}>
          <Text bold color="white">{line.slice(2)}</Text>
        </Box>
      );
      i++;
      continue;
    }

    if (line.startsWith("## ")) {
      elements.push(
        <Box key={key++} marginTop={1} marginBottom={0}>
          <Text bold color="white">{line.slice(3)}</Text>
        </Box>
      );
      i++;
      continue;
    }

    if (line.startsWith("### ")) {
      elements.push(
        <Box key={key++}>
          <Text bold color="blackBright">{line.slice(4)}</Text>
        </Box>
      );
      i++;
      continue;
    }

    if (line.match(/^[-*+] /)) {
      const items: string[] = [];
      const marker = line.startsWith("-") ? "-" : "●";
      while (i < lines.length && lines[i].match(/^[-*+] /)) {
        items.push(lines[i].replace(/^[-*+] /, ""));
        i++;
      }
      elements.push(
        <Box key={key++} flexDirection="column" marginLeft={0}>
          {items.map((item, idx) => (
            <Box key={idx} marginLeft={1}>
              <Text color="blackBright">{` ${marker} `}</Text>
              <InlineText text={item} />
            </Box>
          ))}
        </Box>
      );
      continue;
    }

    if (line.match(/^\d+\. /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        items.push(lines[i].replace(/^\d+\. /, ""));
        i++;
      }
      elements.push(
        <Box key={key++} flexDirection="column">
          {items.map((item, idx) => (
            <Box key={idx} marginLeft={1}>
              <Text color="blackBright">{` ${idx + 1}. `}</Text>
              <InlineText text={item} />
            </Box>
          ))}
        </Box>
      );
      continue;
    }

    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <Box key={key++} borderLeft borderStyle="single" borderColor="blackBright" paddingLeft={1} marginLeft={1}>
          <Text color="blackBright" italic>{quoteLines.join("\n")}</Text>
        </Box>
      );
      continue;
    }

    if (line.match(/^---+$/) || line.match(/^===+$/)) {
      elements.push(
        <Box key={key++} marginTop={0} marginBottom={0}>
          <Text color="#333333">{"─".repeat(Math.min(columns - 4, 40))}</Text>
        </Box>
      );
      i++;
      continue;
    }

    if (line.trim() === "") {
      elements.push(<Box key={key++} height={0} />);
      i++;
      continue;
    }

    // ── TABLE ────────────────────────────────────────────────────────────────
    if (line.match(/^\|.*?\|/)) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].match(/^\|.*?\|/)) {
        if (!lines[i].includes("---")) { 
            const cells = lines[i].split("|")
                .map(c => c.trim())
                .filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
            if (cells.length > 0) rows.push(cells);
        }
        i++;
      }
      elements.push(
        <Box key={key++} flexDirection="column" marginY={1} borderStyle="round" borderColor="blackBright" paddingX={1}>
          {rows.map((row, ridx) => (
            <Box key={ridx} flexDirection="row" gap={2}>
              {row.map((cell, cidx) => (
                <Box key={cidx} width={Math.floor((columns - 10) / row.length)}>
                   <InlineText text={cell} />
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      );
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    const paraText = paraLines.join(" ");
    elements.push(
      <Box key={key++} marginBottom={0}>
        <InlineText text={paraText} />
      </Box>
    );
  }

  return elements;
}

function isBlockStart(line: string): boolean {
  return line.startsWith("```") ||
         line.startsWith("#") ||
         line.match(/^[-*+] /) !== null ||
         line.match(/^\d+\. /) !== null ||
         line.startsWith("> ") ||
         line.match(/^---+$/) !== null ||
         line.startsWith("|");
}

function InlineText({ text }: { text: string }) {
  const parts = parseInline(text);

  return (
    <Text wrap="wrap">
      {parts.map((part, i) => {
        if (part.type === "bold")   return <Text key={i} bold color="white">{part.content}</Text>;
        if (part.type === "italic") return <Text key={i} italic>{part.content}</Text>;
        if (part.type === "code")   return <Text key={i} color="white" backgroundColor="#222222"> {part.content} </Text>;
        if (part.type === "strike") return <Text key={i} strikethrough color="blackBright">{part.content}</Text>;
        return <Text key={i} color="white">{part.content}</Text>;
      })}
    </Text>
  );
}

function parseInline(text: string): Array<{type: string; content: string}> {
  const tokens = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|~~(.+?)~~)/g;
  let last = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      tokens.push({ type: "text", content: text.slice(last, match.index) });
    }
    if (match[2]) tokens.push({ type: "bold",   content: match[2] });
    if (match[3]) tokens.push({ type: "italic", content: match[3] });
    if (match[4]) tokens.push({ type: "code",   content: match[4] });
    if (match[5]) tokens.push({ type: "strike", content: match[5] });
    last = match.index + match[0].length;
  }

  if (last < text.length) tokens.push({ type: "text", content: text.slice(last) });
  return tokens;
}
