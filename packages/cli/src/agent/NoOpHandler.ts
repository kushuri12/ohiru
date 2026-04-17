// packages/cli/src/agent/NoOpHandler.ts
// Handles escalation when agent repeatedly responds without using tools.

import type { ParsedPlan } from "../thinking/index.js";

export interface NoOpAction {
  readonly action: "retry" | "abort";
  readonly message: string;
}

/**
 * Manages the no-op (agent talks but doesn't call tools) scenario
 * with escalating instructions and a hard stop after MAX_RETRIES.
 */
export class NoOpHandler {
  private noOpCount = 0;
  private static readonly MAX_RETRIES = 2;

  private static readonly ESCALATING_PROMPTS: readonly string[] = [
    "USE TOOLS NOW. Do not just talk. Execute the next action with a tool call.",
    "CRITICAL: You MUST call tools to complete this task. Identify the specific tool needed and call it immediately. If you cannot proceed, explain exactly why.",
  ];

  /**
   * Called when the agent responds with text but no tool calls.
   * Returns an action: retry (with escalating message) or abort.
   */
  handleNoOp(plan: ParsedPlan | null): NoOpAction {
    this.noOpCount++;

    if (this.noOpCount > NoOpHandler.MAX_RETRIES) {
      return {
        action: "abort",
        message: [
          "⛔ Agent failed to execute tools after multiple retries.",
          "",
          "Possible reasons:",
          "• The task may be unclear — try rephrasing with specific file paths or commands.",
          "• The model may not know how to proceed — try breaking the task into smaller steps.",
          "• There may be a model-level issue — try switching to a different provider.",
        ].join("\n"),
      };
    }

    const basePrompt = NoOpHandler.ESCALATING_PROMPTS[this.noOpCount - 1]
      ?? NoOpHandler.ESCALATING_PROMPTS[NoOpHandler.ESCALATING_PROMPTS.length - 1];

    // If we have a plan, include the next expected step for guidance
    let message = basePrompt;
    if (plan && plan.steps.length > 0) {
      const pendingSteps = plan.steps.filter((_, i) => i >= 0); // all steps for context
      if (pendingSteps.length > 0) {
        const nextStep = pendingSteps[0];
        message += `\n\nNEXT PLANNED STEP: ${nextStep.verb} ${nextStep.target} — ${nextStep.reason || "execute now"}`;
      }
    }

    return { action: "retry", message };
  }

  /**
   * Reset counter (call when tools ARE successfully called).
   */
  reset(): void {
    this.noOpCount = 0;
  }

  get count(): number {
    return this.noOpCount;
  }
}
