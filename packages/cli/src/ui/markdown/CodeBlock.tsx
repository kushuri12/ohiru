import React from "react";
import { Box, Text } from "ink";
import { highlight } from "cli-highlight";
import chalk from "chalk";

export interface CodeBlockProps {
  code: string;
  language: string;
  columns: number;
}

export function CodeBlock({ code, language, columns }: CodeBlockProps) {
  const availableWidth = columns - 6;

  let highlighted: string;
  try {
    highlighted = highlight(code, {
      language: language === "text" ? undefined : language,
      ignoreIllegals: true,
      theme: {
        keyword:  chalk.cyanBright,
        string:   chalk.greenBright,
        number:   chalk.yellowBright,
        comment:  chalk.blackBright.italic,
        class:    chalk.blueBright.bold,
        function: chalk.yellowBright,
        built_in: chalk.cyanBright,
        attr:     chalk.cyan,
        literal:  chalk.yellowBright,
        type:     chalk.blueBright,
        params:   chalk.white,
        tag:      chalk.greenBright,
        name:     chalk.yellowBright,
        attribute:chalk.cyan,
        regexp:   chalk.redBright,
        symbol:   chalk.white,
        meta:     chalk.blackBright,
        link:     chalk.cyan.underline,
        default:  chalk.white,
      },
    });
  } catch {
    highlighted = code;
  }

  const codeLines = highlighted.split("\n");

  return (
    <Box flexDirection="column" marginTop={0} marginBottom={1}>
      <Box>
        <Text color="blackBright">{"  "}</Text>
        <Text color="blackBright" dimColor>
          {language !== "text" ? language : ""}
          {" ─".repeat(Math.max(0, Math.floor(availableWidth / 2) - language.length))}
        </Text>
      </Box>

      {codeLines.map((line, idx) => (
        <Box key={idx}>
          <Text color="blackBright">{"  │ "}</Text>
          {codeLines.length > 10 && (
            <Text color="blackBright" dimColor>
              {String(idx + 1).padStart(3, " ")}{"  "}
            </Text>
          )}
          <Text>{line}</Text>
        </Box>
      ))}

      <Box>
        <Text color="blackBright">{"  └" + "─".repeat(Math.min(availableWidth, 50))}</Text>
      </Box>
    </Box>
  );
}
