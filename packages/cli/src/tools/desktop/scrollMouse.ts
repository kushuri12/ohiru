import { z } from "zod";

export const scrollMouseTool: any = {
  description: `Scroll the mouse wheel at the current position or at given coordinates.
Use when content is not visible on screen (lists, dropdowns, web pages, long forms).
direction: 'up' | 'down' | 'left' | 'right'
amount: number of scroll clicks (default 3)`,

  parameters: z.object({
    direction: z.enum(["up", "down", "left", "right"]).default("down"),
    amount: z.number().optional().default(3).describe("Scroll clicks (3 = moderate, 10 = page-level)"),
    x: z.number().optional().describe("X to move mouse before scrolling (optional)"),
    y: z.number().optional().describe("Y to move mouse before scrolling (optional)"),
  }),

  execute: async (args: any) => {
    const { direction, amount = 3, x, y } = args;
    const robot = await import("@nut-tree-fork/nut-js");
    const { mouse, straightTo, Point } = robot;

    if (x !== undefined && y !== undefined) {
      await mouse.move(straightTo(new Point(Number(x), Number(y))));
    }

    for (let i = 0; i < amount; i++) {
      if (direction === "down")  await mouse.scrollDown(1);
      if (direction === "up")    await mouse.scrollUp(1);
      if (direction === "left")  await mouse.scrollLeft(1);
      if (direction === "right") await mouse.scrollRight(1);
      await new Promise(r => setTimeout(r, 50));
    }

    return `✓ Scrolled ${direction} × ${amount}`;
  },
};
