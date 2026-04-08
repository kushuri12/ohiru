import React from "react";
import { Box, Text } from "ink";

interface Shortcut {
  key: string;
  label: string;
  show?: boolean;
}

export function ShortcutBar({ isProcessing }: { isProcessing: boolean }) {
  const shortcuts: Shortcut[] = [
    { key: "esc",    label: "quit",       show: !isProcessing },
    { key: "ctrl+c", label: "interrupt",  show: isProcessing },
    { key: "↑↓",     label: "history",    show: !isProcessing },
    { key: "ctrl+r", label: "retry",      show: true },
    { key: "ctrl+l", label: "clear",      show: !isProcessing },
  ];

  const visible = shortcuts.filter(s => s.show !== false);

  return (
    <Box flexDirection="row" paddingX={1} flexWrap="wrap">
      {visible.map((s, i) => (
        <React.Fragment key={s.key}>
          <Text backgroundColor="blackBright" color="white"> {s.key} </Text>
          <Text color="blackBright"> {s.label}</Text>
          {i < visible.length - 1 && (
            <Text color="blackBright">{"  "}</Text>
          )}
        </React.Fragment>
      ))}
    </Box>
  );
}
