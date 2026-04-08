// src/tools/desktop/examineImage.ts
import { z } from "zod";

export const examineImageTool: any = {
  description: `Analyze or describe an image at the given local file path.
Use this ONLY if you have vision capabilities. It allows you to 'see' the pixels.`,

  parameters: z.object({
    path: z.string().describe("Local path to the image file (png, jpg, webp) to analyze."),
    screenshot_meta: z.string().optional().describe(
      "JSON string from take_screenshot result. If provided, computes total scale factor automatically."
    ),
  }),

  execute: async (args: any) => {
    const { path: imgPath } = args;
    const { readFile } = await import("node:fs/promises");
    const pathMod = await import("path");

    try {
      const fullPath = pathMod.default.resolve(imgPath);
      const rawBuffer = await readFile(fullPath);
      const ext = pathMod.default.extname(fullPath).toLowerCase();
      
      let finalBuffer: any = rawBuffer;
      let mimeType = ext === ".png" ? "image/png" : (ext === ".webp" ? "image/webp" : "image/jpeg");

      // Optimization: Resize large images to avoid "Model Stalled" timeouts (Max 1024px width)
      try {
        const sharp = (await import("sharp")).default;
        finalBuffer = await sharp(rawBuffer as any)
          .resize(1024, undefined, { withoutEnlargement: true })
          .jpeg({ quality: 80 }) // JPEG is lighter for transmission
          .toBuffer();
        mimeType = "image/jpeg";
      } catch (sharpError) {
        // Fallback to raw buffer if sharp fails or is missing
      }

      // Get resolution metadata
      let originalWidth = 0;
      let originalHeight = 0;
      try {
        const sharp = (await import("sharp")).default;
        const meta = await sharp(rawBuffer as any).metadata();
        originalWidth = meta.width || 0;
        originalHeight = meta.height || 0;
      } catch {}

      // Return multi-modal result
      let screenW = originalWidth, screenH = originalHeight;
      if (args.screenshot_meta) {
        try {
          const meta = JSON.parse(args.screenshot_meta);
          screenW = (meta.display?.original_width || meta.original_width) || originalWidth;
          screenH = (meta.display?.original_height || meta.original_height) || originalHeight;
        } catch {}
      }

      const visionH = Math.round(1024 * originalHeight / originalWidth);
      const scaleX = screenW / 1024;
      const scaleY = screenH / visionH;

      return [
        { 
          type: "text", 
          text: `Analyzing image: ${pathMod.default.basename(fullPath)}...\n` +
                `Vision Dimensions (what you see): [1024 × ${visionH} px]\n` +
                `Saved File Dimensions: [${originalWidth} × ${originalHeight} px]\n` +
                (screenW !== originalWidth ? `REAL Screen Dimensions: [${screenW} × ${screenH} px]\n` : "") +
                `\n⚠️  COORDINATE SCALING REQUIRED:\n` +
                `  real_x = vision_x × ${scaleX.toFixed(4)}\n` +
                `  real_y = vision_y × ${scaleY.toFixed(4)}\n` +
                `\n  Example: if you see a button at vision (300, 200), real click = ` +
                `(${Math.round(300 * scaleX)}, ${Math.round(200 * scaleY)})\n` +
                `\n✅  RECOMMENDED: call click_element (by name) if possible.`
        },
        { 
          type: "image", 
          image: finalBuffer.toString("base64"),
          mimeType
        }
      ];
    } catch (e: any) {
      throw new Error(`Failed to read/analyze image: ${e.message}`);
    }
  },
};
