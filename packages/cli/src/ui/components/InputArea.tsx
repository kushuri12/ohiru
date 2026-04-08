import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

interface InputAreaProps {
  onSubmit: (input: string) => void;
  onChange?: (value: string) => void;
  disabled?: boolean;
  processingElapsedMs?: number;
}

export function InputArea({ onSubmit, onChange, disabled, processingElapsedMs = 0 }: InputAreaProps) {
  const [value, setValue] = useState("");
  const SHOW_INTERRUPT_AFTER = 15000; // 15 seconds

  const handleChange = (val: string) => {
    if (disabled) return;
    setValue(val);
    if (onChange) onChange(val);
  };

  const handleEnter = (input: string) => {
    const text = input.trim();
    if (!text || disabled) return;
    onSubmit(text);
    setValue("");
    if (onChange) onChange("");
  };

  const TI: any = (TextInput as any).default || TextInput;

  return (
    <Box 
      flexDirection="column" 
      paddingX={1}
      width="100%"
      marginTop={1}
    >
      <Box flexDirection="row" justifyContent="space-between">
        <Box flexDirection="row" flexGrow={1}>
          <Box marginRight={2}>
            <Text color="white" bold>You</Text>
          </Box>
          {disabled ? (
            <Text color="blackBright" dimColor italic>Considering...</Text>
          ) : (
            <TI
              value={value}
              placeholder="Ask anything..."
              onChange={handleChange}
              onSubmit={handleEnter}
            />
          )}
        </Box>

        {disabled && processingElapsedMs > SHOW_INTERRUPT_AFTER && (
          <Box>
            <Text color="yellow" dimColor>
              { (processingElapsedMs / 1000).toFixed(0) }s  ctrl+c to interrupt
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
