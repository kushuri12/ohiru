import { z } from "zod";

export const dragDropTool: any = {
  description: `Drag from one screen coordinate to another.
Use for: moving files, reordering items, resizing panels.
All coordinates must be REAL screen coordinates (already scaled).`,

  parameters: z.object({
    from_x: z.number(), from_y: z.number(),
    to_x: z.number(),   to_y: z.number(),
    duration_ms: z.number().optional().default(500),
  }),

  execute: async (args: any) => {
    const { from_x, from_y, to_x, to_y, duration_ms = 500 } = args;
    const robot = await import("@nut-tree-fork/nut-js");
    const { mouse, Button, straightTo, Point } = robot;

    await mouse.move(straightTo(new Point(from_x, from_y)));
    await mouse.pressButton(Button.LEFT);
    await new Promise(r => setTimeout(r, 100));
    
    // Smooth drag in steps
    const steps = 20;
    for (let i = 1; i <= steps; i++) {
      const ix = from_x + (to_x - from_x) * (i / steps);
      const iy = from_y + (to_y - from_y) * (i / steps);
      await mouse.move(straightTo(new Point(Math.round(ix), Math.round(iy))));
      await new Promise(r => setTimeout(r, duration_ms / steps));
    }

    await mouse.releaseButton(Button.LEFT);
    return `✓ Dragged (${from_x},${from_y}) → (${to_x},${to_y})`;
  },
};
