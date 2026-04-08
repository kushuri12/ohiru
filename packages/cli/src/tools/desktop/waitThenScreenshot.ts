import { z } from "zod";

export const waitThenScreenshotTool: any = {
  description: `Wait for a specified time then take a screenshot.
Use after clicking, opening apps, or triggering loading states.
wait_ms: how long to wait (500–5000ms recommended)`,

  parameters: z.object({
    wait_ms: z.number().default(1500).describe("Milliseconds to wait before screenshotting"),
    save_to: z.string().optional(),
  }),

  execute: async (args: any) => {
    const { wait_ms = 1500, save_to } = args;
    await new Promise(r => setTimeout(r, Math.min(wait_ms, 10000)));
    const { takeScreenshotTool } = await import("./takeScreenshot.js");
    return takeScreenshotTool.execute({ save_to });
  },
};
