export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool_call" | "tool_result" | "tool";
  content: string | any[]; // Support for multimodal content (text + images)
  toolCall?: any;
  toolResult?: any;
  toolCallId?: string; // For syncing tool results
}

export interface ActiveTool {
  name: string;
  input: any;
  startTime: number;
  liveLines?: string[];
  liveLinesTotal?: number;
  progress?: {
    percent: number;
    linesWritten: number;
    totalLines: number;
    bytesWritten: number;
    totalBytes: number;
    speed: string;
    eta: number;
    message: string;
  };
}
