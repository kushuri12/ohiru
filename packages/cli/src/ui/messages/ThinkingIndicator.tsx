import React from "react";
import { Box, Text } from "ink";
import { Spinner } from "@inkjs/ui";

export function ThinkingIndicator() {
  return (
    <Box flexDirection="row" marginTop={1} marginBottom={0}>
       <Box width={2} marginRight={1}>
          <Text color="#CC785C">＊</Text>
       </Box>
        <Text color="#D97757" bold>Hiru </Text>
        <Text color="blackBright">(thinking...)</Text>
        {/* Added heartbeat context for the user to see it's alive */}
        <HeartbeatHint />
     </Box>
  );
}

function HeartbeatHint() {
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    const i = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(i);
  }, []);

  if (elapsed > 30) return <Text color="yellow">  ⚠️ Response is taking longer than usual...</Text>;
  return null;
}
