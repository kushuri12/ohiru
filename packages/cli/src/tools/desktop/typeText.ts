// src/tools/desktop/typeText.ts
import { z } from "zod";

export const typeTextTool: any = {
  description: `Type text into the currently active application window.
The text is sent as keyboard input to whatever window has focus.
Use this after open_app to type into that application.
IMPORTANT: There may be a small delay after opening an app before it's ready to receive input.`,

  parameters: z.object({
    text: z.string().describe("Text to type into the active window"),
    delay_ms: z.number().optional().default(100).describe("Delay between keystrokes in ms (default 100)"),
    pause_before_ms: z.number().optional().default(500).describe("Wait before typing in ms (default 500, increase for slow apps)"),
  }),

  execute: async (args: any) => {
    const { text, delay_ms = 100, pause_before_ms = 500 } = args;

    // Dynamic import — nut-js is optional
    let robot: any;
    try {
      robot = await import("@nut-tree-fork/nut-js");
    } catch {
      throw new Error(
        "Desktop automation not available. Install with: npm install @nut-tree-fork/nut-js"
      );
    }

    const { keyboard } = robot;
    keyboard.config.autoDelayMs = delay_ms;

    // Tunggu sebentar agar window siap
    if (pause_before_ms > 0) {
      await new Promise(r => setTimeout(r, pause_before_ms));
    }

    // Ketik teks
    await keyboard.type(text);

    return `✓ Typed ${text.length} characters: "${text.slice(0, 50)}${text.length > 50 ? "..." : ""}"`;
  },
};
