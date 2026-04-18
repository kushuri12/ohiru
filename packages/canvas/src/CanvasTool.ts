import { z } from "zod";
import { CanvasServer } from "./CanvasServer.js";
import { v4 as uuidv4 } from "uuid";

export function createCanvasTools(server: CanvasServer) {
  return {
    canvas_create_node: {
      description: "Create a new node on the live canvas.",
      parameters: z.object({
        type: z.enum(["text", "code", "image", "chart", "table", "diagram", "iframe", "component"]),
        content: z.any(),
        x: z.number().default(0),
        y: z.number().default(0),
        width: z.number().default(300),
        height: z.number().default(200),
      }),
      execute: async (args: any) => {
        const id = uuidv4();
        const node = {
          id,
          type: args.type,
          content: args.content,
          position: { x: args.x, y: args.y },
          size: { width: args.width, height: args.height },
          metadata: {}
        };
        server.getState().addNode(node);
        server.broadcast({ type: "NODE_CREATED", node });
        return `Node created with ID: ${id}`;
      }
    },

    canvas_update_node: {
      description: "Update an existing node on the canvas.",
      parameters: z.object({
        id: z.string(),
        content: z.any().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
      }),
      execute: async (args: any) => {
        const updates: any = {};
        if (args.content !== undefined) updates.content = args.content;
        if (args.x !== undefined || args.y !== undefined) {
           updates.position = { x: args.x ?? 0, y: args.y ?? 0 };
        }
        server.getState().updateNode(args.id, updates);
        server.broadcast({ type: "NODE_UPDATED", id: args.id, updates });
        return `Node ${args.id} updated.`;
      }
    },

    canvas_clear: {
      description: "Clear the entire canvas visualization.",
      parameters: z.object({}),
      execute: async () => {
        server.getState().clear();
        server.broadcast({ type: "CLEAR" });
        return "Canvas cleared.";
      }
    }
  };
}
