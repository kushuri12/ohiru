// src/tools/desktop/takeScreenshot.ts
import { z } from "zod";
import path from "path";
import os from "os";

export const takeScreenshotTool: any = {
  description: `Take a screenshot of the screen or a specific window.
The screenshot is saved to a temp file and returned as a file path.
In Telegram mode, the screenshot is automatically sent as a photo.`,

  parameters: z.object({
    save_to: z.string().optional().describe("Optional: save screenshot to this path. Default: temp file."),
    resize_width: z.number().optional().default(1280).describe("Max width for output (default 1280px)"),
    window_only: z.boolean().optional().default(false).describe("Capture only the active window instead of full screen"),
  }),

  execute: async (args: any) => {
    const { save_to, resize_width = 1280 } = args;

    let screenshotDesktop: any;
    try {
      screenshotDesktop = (await import("screenshot-desktop")).default;
    } catch {
      throw new Error("Screenshot not available. npm install screenshot-desktop sharp");
    }

    const { getScreenshotPath, ensureHiruDirs } = await import("../../utils/paths.js");
    await ensureHiruDirs();

    const outputPath = save_to || getScreenshotPath();

    try {
      // Ambil screenshot
      const imgBuffer = await screenshotDesktop({ format: "png" });

      // Processing with sharp
      let finalBuffer = imgBuffer;
      let originalWidth = 0;
      let originalHeight = 0;
      
      try {
        const sharp = (await import("sharp")).default;
        const meta = await sharp(imgBuffer).metadata();
        originalWidth = meta.width || 0;
        originalHeight = meta.height || 0;

        let pipeline = sharp(imgBuffer);

        if (args.window_only) {
          const bounds = await getActiveWindowBounds();
          if (bounds && bounds.w > 0 && bounds.h > 0) {
            // Ensure bounds are within image dimensions
            const left = Math.max(0, bounds.x);
            const top = Math.max(0, bounds.y);
            const width = Math.min(bounds.w, originalWidth - left);
            const height = Math.min(bounds.h, originalHeight - top);
            
            pipeline = pipeline.extract({ left, top, width, height });
            // Update "original" to the window size for scaling purposes
            originalWidth = width;
            originalHeight = height;
          }
        }

        finalBuffer = await pipeline
          .resize(resize_width, undefined, { withoutEnlargement: true })
          .png({ quality: 80 })
          .toBuffer();
      } catch (e) {
        // sharp fail or missing, use raw (resize_width won't be applied)
        console.error("Sharp processing failed:", e);
      }

      const { writeFile } = await import("node:fs/promises");
      await writeFile(outputPath, finalBuffer);

      const sizeKB = Math.round(finalBuffer.length / 1024);

      return JSON.stringify({
        path: outputPath,
        size_kb: sizeKB,
        __type: "screenshot",
        display: {
          original_width: originalWidth,
          original_height: originalHeight,
          scaled_width: resize_width,
          scale_factor: originalWidth ? (originalWidth / resize_width).toFixed(4) : 1
        }
      });
    } catch (e: any) {
      throw new Error(`Screenshot failed: ${e.message}`);
    }
  },
};

async function getActiveWindowBounds() {
  try {
    const { execa } = await import("execa");
    const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
$hwnd = [Win32]::GetForegroundWindow()
$rect = New-Object Win32+RECT
if ([Win32]::GetWindowRect($hwnd, [ref]$rect)) {
    @{ x = $rect.Left; y = $rect.Top; w = $rect.Right - $rect.Left; h = $rect.Bottom - $rect.Top } | ConvertTo-Json
} else { "null" }
`;
    const { stdout } = await execa("powershell", ["-Command", script], { shell: true });
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}
