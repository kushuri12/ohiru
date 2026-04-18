export type TaskType = "reasoning" | "coding" | "retrieval" | "vision" | "fast";

export class ModelRouter {
  private config: any;

  constructor(config: any) {
    this.config = config;
  }

  public route(task: TaskType): string {
    // Basic routing logic
    switch (task) {
      case "reasoning":
        return this.config.providers.openai.models.find((m: any) => m.id === "o1")?.id || "gpt-4o";
      case "coding":
        return "claude-3-5-sonnet";
      case "fast":
        return "gpt-4o-mini";
      case "retrieval":
        return "gemini-1.5-flash";
      default:
        return this.config.model;
    }
  }

  public getModelForTokens(tokenCount: number): string {
    if (tokenCount > 100000) return "gemini-1.5-pro";
    return this.config.model;
  }
}
