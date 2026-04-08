import React from "react";
import { Box, Text } from "ink";

const COMMANDS = [
  { name: "/cm", desc: "Change model" },
  { name: "/thinking", desc: "compact|verbose|silent" },
  { name: "/plan", desc: "on|off" },
  { name: "/auto-approve", desc: "on|off" },
  { name: "/clear", desc: "Clear chat history" },
  { name: "/exit", desc: "Quit Hiru" },
  { name: "/help", desc: "Show all commands" },
];

export function SlashCommandMenu({ filter }: { filter: string }) {
  const filtered = COMMANDS.filter(cmd => cmd.name.startsWith(filter));
  if (filtered.length === 0) return null;

  return (
    <Box 
      flexDirection="column" 
      borderStyle="round" 
      borderColor="#CC785C" 
      paddingX={1}
      width={60}
      marginBottom={0}
      marginLeft={2}
    >
      <Box marginBottom={1}>
        <Text color="blackBright" bold>COMMANDS</Text>
      </Box>
      
      {filtered.map(cmd => (
        <Box key={cmd.name} justifyContent="space-between">
          <Text color="cyan" bold>{cmd.name.padEnd(15)}</Text>
          <Text color="blackBright">{cmd.desc}</Text>
        </Box>
      ))}
    </Box>
  );
}
