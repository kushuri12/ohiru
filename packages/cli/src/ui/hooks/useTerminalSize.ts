import { useState, useEffect } from "react";
import terminalSize from "terminal-size";

export function useTerminalSize() {
  const [size, setSize] = useState(terminalSize());

  useEffect(() => {
    const handler = () => {
        setSize(terminalSize());
    };
    process.stdout.on("resize", handler);
    return () => { 
        process.stdout.off("resize", handler); 
    };
  }, []);

  return size;
}
