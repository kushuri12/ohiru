// src/tools/desktop/moveMouse.ts
import { z } from "zod";

export const moveMouseTool: any = {
  description: `Move mouse and/or click at real screen coordinates.
Coordinates (0,0) are top-left of the REAL SCREEN — not the screenshot image.

⚠️ SCALING IS MANDATORY:
If you got coordinates from examine_image (vision), you MUST scale them first:
  real_x = vision_x × (original_screen_width / 1024)
  real_y = vision_y × (original_screen_height / <vision image height>)

BEST PRACTICE:
1. take_screenshot → note original_width (W) and original_height (H)
2. examine_image → find element at (vx, vy)
3. move_mouse at (round(vx×W/1024), round(vy×H/576))
4. take_screenshot again to verify

OR use inspect_ui for exact coordinates with no math required.`,

  parameters: z.object({
    x: z.number().describe("X coordinate (pixels from left)"),
    y: z.number().describe("Y coordinate (pixels from top)"),
    action: z.enum(["move", "click", "double_click", "right_click"]).default("click"),
    pause_before_ms: z.number().optional().default(300),
  }),

  execute: async (args: any) => {
    const { x, y, action = "click", pause_before_ms = 300 } = args;

    let robot: any;
    try {
      robot = await import("@nut-tree-fork/nut-js");
    } catch {
      throw new Error("Desktop automation not available. npm install @nut-tree-fork/nut-js");
    }

    const { mouse, Button, straightTo, Point } = robot;

    if (pause_before_ms > 0) {
      await new Promise(r => setTimeout(r, pause_before_ms));
    }

    // Force numeric types to prevent "Point expects number" errors
    const numX = Number(x);
    const numY = Number(y);

    if (isNaN(numX) || isNaN(numY)) {
      throw new Error(`Invalid coordinates: x=${x}, y=${y}. Both must be numeric.`);
    }

    await mouse.move(straightTo(new Point(numX, numY)));

    if (action === "click")        await mouse.click(Button.LEFT);
    if (action === "double_click") await mouse.doubleClick(Button.LEFT);
    if (action === "right_click")  await mouse.click(Button.RIGHT);

    return `✓ Mouse ${action} at (${x}, ${y})`;
  },
};
