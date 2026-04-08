import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { renderMarkdownToInk } from "../markdown/MarkdownRenderer.js";

interface AssistantMessageProps {
  content: string;
  isStreaming: boolean;
  columns: number;
}

export function AssistantMessage({ content, isStreaming, columns }: AssistantMessageProps) {
  // We place the bullet point alongside the rendered markdown text.
  // The dot acts as the 'hiru' speaker indicator, saving tons of vertical space.
  return (
    <Box flexDirection="row" marginTop={1} marginBottom={0} paddingX={1}>
      <Box marginRight={1}>
        <Text color="#D97757" bold>Hiru</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {renderMarkdownToInk(content, columns - 2)}
        {isStreaming && (
          <Box marginTop={content ? 1 : 0}>
             <BlinkingCursor />
          </Box>
        )}
      </Box>
    </Box>
  );
}

export function BlinkingCursor() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setVisible(v => !v), 500);
    return () => clearInterval(timer);
  }, []);

  return <Text color="#D97757">{visible ? "█" : " "}</Text>;
}
