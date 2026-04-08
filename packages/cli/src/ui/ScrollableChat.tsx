import React from "react";
import { Box, Static, Text } from "ink";
import { UserMessage } from "./messages/UserMessage.js";
import { AssistantMessage } from "./messages/AssistantMessage.js";
import { ToolCallBlock } from "./messages/ToolCallBlock.js";
import { ThinkingIndicator } from "./messages/ThinkingIndicator.js";

export function ScrollableChat({ messages, isThinking, streamingText, columns, isExpanded }: any) {
  return (
    <>
      <Box flexDirection="column" paddingTop={1}>
        <Static items={messages}>
          {(msg: any) => <MessageRenderer key={msg.id} message={msg} columns={columns} isExpanded={isExpanded} />}
        </Static>
      </Box>

      <Box flexDirection="column">
        {streamingText ? (
          <AssistantMessage content={streamingText} isStreaming={true} columns={columns} />
        ) : null}

        {isThinking && !streamingText ? <ThinkingIndicator /> : null}
      </Box>
    </>
  );
}

function MessageRenderer({ message, columns, isExpanded }: any) {
  switch (message.role) {
    case "user":
      return <UserMessage content={message.content} columns={columns} />;
    case "assistant":
      // Check if there is reasoning/thought in the content or if we have specialized thought block
      return <AssistantMessage content={message.content} isStreaming={false} columns={columns} />;
    case "tool_call":
      return <ToolCallBlock call={message.toolCall} result={message.toolResult} columns={columns} isExpanded={isExpanded} />;
    case "system":
      return (
        <Box marginTop={1} marginBottom={1}>
          <Text color="red">{message.content}</Text>
        </Box>
      );
    default:
      return null;
  }
}
