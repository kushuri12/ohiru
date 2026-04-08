import React from "react";
import { Box, Text } from "ink";

export function UserMessage({ content }: { content: string; columns: number }) {
  return (
    <Box 
      flexDirection="row" 
      marginTop={1} 
      marginBottom={0} 
      paddingX={1}
      backgroundColor="#3c3836"
    >
      <Box marginRight={2}>
        <Text color="cyan" bold>You</Text>
      </Box>
      <Box flexShrink={1}>
        <Text color="white">{content}</Text>
      </Box>
    </Box>
  );
}
