import React from "react";
import { Box, Text } from "ink";

export function WelcomeBanner({ provider, model, project, columns }: any) {
  const isTall = columns >= 80;
  return (
    <Box flexDirection="column" alignItems="center" paddingY={isTall ? 1 : 0}>
      {isTall && (
        <Box flexDirection="column" alignItems="center">
          <Text color="#CC785C" bold>{" ██╗  ██╗██╗██████╗ ██╗   ██╗"}</Text>
          <Text color="#CC785C" bold>{" ██║  ██║██║██╔══██╗██║   ██║"}</Text>
          <Text color="#CC785C" bold>{" ███████║██║██████╔╝██║   ██║"}</Text>
          <Text color="#CC785C">{" ██╔══██║██║██╔══██╗██║   ██║"}</Text>
          <Text color="#CC785C">{" ██║  ██║██║██║  ██║╚██████╔╝"}</Text>
          <Text color="blackBright">{" ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝ ╚═════╝ "}</Text>
        </Box>
      )}
      <Box marginTop={1} flexDirection="row" gap={1}>
        <Text color="blackBright">{"agentic coding CLI"}</Text>
        <Text color="blackBright">{"·"}</Text>
        <Text color="white">{provider}</Text>
        <Text color="blackBright">{"/"}</Text>
        <Text color="#CC785C">{model}</Text>
      </Box>
      {project && (
        <Box marginTop={0}>
          <Text color="blackBright">{"project: "}</Text>
          <Text color="white">{project}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color="blackBright">{"─".repeat(Math.min(columns - 4, 48))}</Text>
      </Box>
    </Box>
  );
}
