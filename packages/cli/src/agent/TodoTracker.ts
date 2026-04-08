export interface TodoItem {
  toolCallId: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
  timestamp: number;
}

export class TodoTracker {
  private todos: Map<string, TodoItem> = new Map();
  private order: string[] = [];

  add(toolCallId: string, toolName: string, args: any, status: TodoItem["status"] = "running"): TodoItem {
    const item: TodoItem = {
      toolCallId,
      label: this.formatLabel(toolName, args),
      status,
      timestamp: Date.now(),
    };
    this.todos.set(toolCallId, item);
    this.order.push(toolCallId);
    return item;
  }

  update(toolCallId: string, status: "done" | "error"): void {
    const item = this.todos.get(toolCallId);
    if (item) item.status = status;
  }

  getAll(): TodoItem[] {
    return this.order
      .map(id => this.todos.get(id))
      .filter((t): t is TodoItem => !!t);
  }

  getActive(): TodoItem[] {
    return this.getAll().filter(t => t.status === "running" || t.status === "pending");
  }

  getSummary(): { total: number; done: number; error: number; active: number } {
    const all = this.getAll();
    return {
      total: all.length,
      done: all.filter(t => t.status === "done").length,
      error: all.filter(t => t.status === "error").length,
      active: all.filter(t => t.status === "running" || t.status === "pending").length,
    };
  }

  reset(): void {
    this.todos.clear();
    this.order = [];
  }

  private formatLabel(toolName: string, args: any): string {
    switch (toolName) {
      case "read_file": {
        const p = args?.path || args?.file_path || "?";
        return `Read ${this.basename(p)}`;
      }
      case "write_file":
      case "create_file": {
        const p = args?.path || args?.file_path || "?";
        return `Write ${this.basename(p)}`;
      }
      case "edit_file": {
        const p = args?.path || args?.file_path || "?";
        return `Edit ${this.basename(p)}`;
      }
      case "list_files": {
        const p = args?.path || ".";
        return `List ${p === "." ? "files" : this.basename(p)}`;
      }
      case "search_files": {
        const pat = String(args?.pattern || "?");
        return `Search "${pat.length > 20 ? pat.slice(0, 20) + "..." : pat}"`;
      }
      case "run_shell": {
        const cmd = String(args?.command || args?.cmd || "?");
        return `Run: ${cmd.length > 30 ? cmd.slice(0, 30) + "..." : cmd}`;
      }
      default:
        return toolName;
    }
  }

  private basename(p: string): string {
    const parts = p.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] || p;
  }

  createSyntheticPlan(toolName: string, args: any): any {
    const label = this.formatLabel(toolName, args);
    return {
      goal: `Execute ${label}`,
      steps: [{
        number: 1,
        verb: toolName === "run_shell" ? "Run" : "Execute",
        target: label,
        reason: "Auto-generated from direct tool call",
        isDestructive: ["write_file", "edit_file", "run_shell"].includes(toolName),
        requiresConfirm: false,
      }],
      filesAffected: [],
      assumptions: [],
      risks: [],
      isDestructive: ["write_file", "edit_file", "run_shell"].includes(toolName),
      estimatedSteps: 1,
      confidence: "low",
      raw: `GOAL: Execute ${label}\nSTEPS: 1. Action taken directly.`
    };
  }
}
