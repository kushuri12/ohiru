import { z } from "zod";

export const CanvasNodeSchema = z.object({
  id: z.string(),
  type: z.enum(["text", "code", "image", "chart", "table", "diagram", "iframe", "component"]),
  content: z.any(),
  position: z.object({ x: z.number(), y: z.number() }),
  size: z.object({ width: z.number(), height: z.number() }),
  metadata: z.record(z.any()).default({}),
});

export type CanvasNode = z.infer<typeof CanvasNodeSchema>;

export class CanvasState {
  private nodes: Map<string, CanvasNode> = new Map();
  private connections: any[] = [];

  public addNode(node: CanvasNode) {
    this.nodes.set(node.id, node);
  }

  public updateNode(id: string, updates: Partial<CanvasNode>) {
    const node = this.nodes.get(id);
    if (node) {
      this.nodes.set(id, { ...node, ...updates });
    }
  }

  public deleteNode(id: string) {
    this.nodes.delete(id);
  }

  public getSnapshot() {
    return {
      nodes: Array.from(this.nodes.values()),
      connections: this.connections,
    };
  }

  public clear() {
    this.nodes.clear();
    this.connections = [];
  }
}
