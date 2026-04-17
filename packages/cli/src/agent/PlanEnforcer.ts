// packages/cli/src/agent/PlanEnforcer.ts
// Ensures execution follows the approved plan. Detects deviations and skipped steps.

import type { ParsedPlan } from "../thinking/index.js";

export interface PlanValidation {
  readonly valid: boolean;
  readonly message: string;
  readonly stepIndex?: number;
}

interface ParsedStep {
  number: number;
  verb: string;
  target: string;
  reason?: string;
}

/**
 * Validates that tool calls during execution match the approved plan steps.
 * Reports deviations and skipped steps without blocking execution.
 */
export class PlanEnforcer {
  private plan: ParsedPlan | null = null;
  private executedSteps: Set<number> = new Set();
  private deviationCount = 0;
  private static readonly MAX_DEVIATIONS = 5;

  /**
   * Set the plan to enforce. Resets tracking state.
   */
  setApprovedPlan(plan: ParsedPlan): void {
    this.plan = plan;
    this.executedSteps.clear();
    this.deviationCount = 0;
  }

  /**
   * Validate a tool call against the approved plan.
   * Returns whether the call matches a planned step, and reports deviations.
   */
  validateToolCall(toolName: string, toolArgs: any): PlanValidation {
    if (!this.plan) {
      return { valid: true, message: "No plan to enforce." };
    }

    // Find matching step
    const matchIdx = this.findMatchingStepIndex(toolName, toolArgs);

    if (matchIdx === -1) {
      this.deviationCount++;

      if (this.deviationCount >= PlanEnforcer.MAX_DEVIATIONS) {
        return {
          valid: false,
          message: `Plan enforcement: ${this.deviationCount} deviations from plan detected. Agent may be off-track.`,
        };
      }

      // Soft warning — don't block
      return {
        valid: true,
        message: `Note: Tool "${toolName}" is not in the approved plan. ${this.deviationCount}/${PlanEnforcer.MAX_DEVIATIONS} deviations.`,
      };
    }

    this.executedSteps.add(matchIdx);

    return {
      valid: true,
      message: `Plan step ${matchIdx + 1}/${this.plan.steps.length} matched.`,
      stepIndex: matchIdx,
    };
  }

  /**
   * Get a summary of plan progress.
   */
  getProgress(): { completed: number; total: number; remaining: string[] } {
    if (!this.plan) return { completed: 0, total: 0, remaining: [] };

    const remaining = this.plan.steps
      .filter((_, i) => !this.executedSteps.has(i))
      .map(s => `${s.verb} ${s.target}`);

    return {
      completed: this.executedSteps.size,
      total: this.plan.steps.length,
      remaining,
    };
  }

  reset(): void {
    this.plan = null;
    this.executedSteps.clear();
    this.deviationCount = 0;
  }

  // --- Private ---

  private findMatchingStepIndex(toolName: string, toolArgs: any): number {
    if (!this.plan) return -1;

    for (let i = 0; i < this.plan.steps.length; i++) {
      if (this.executedSteps.has(i)) continue; // Already matched

      const step = this.plan.steps[i] as ParsedStep;
      const expectedTool = this.verbToTool(step.verb);

      if (expectedTool === toolName || this.fuzzyMatch(step.verb, toolName)) {
        // Check if target loosely matches args
        if (this.targetMatchesArgs(step.target, toolArgs)) {
          return i;
        }
      }
    }

    return -1;
  }

  private verbToTool(verb: string): string {
    const v = verb.toLowerCase();
    const mapping: Record<string, string> = {
      read: "read_file",
      write: "write_file",
      create: "create_file",
      edit: "edit_file",
      modify: "edit_file",
      update: "edit_file",
      run: "run_shell",
      execute: "run_shell",
      install: "run_shell",
      build: "run_shell",
      test: "run_shell",
      list: "list_files",
      search: "search_files",
      grep: "search_files",
      fetch: "fetch_api",
      screenshot: "take_screenshot",
      click: "click_element",
      inspect: "inspect_ui",
      open: "open_app",
      type: "type_text",
    };
    return mapping[v] || v;
  }

  private fuzzyMatch(verb: string, toolName: string): boolean {
    const v = verb.toLowerCase();
    const t = toolName.toLowerCase();
    // "Create" matches both "write_file" and "create_file"
    if (v === "create" && (t === "write_file" || t === "create_file")) return true;
    if (v === "check" && (t === "read_file" || t === "run_shell" || t === "search_files")) return true;
    if (v === "verify" && (t === "run_shell" || t === "read_file")) return true;
    return false;
  }

  private targetMatchesArgs(target: string, args: any): boolean {
    if (!args || !target) return true; // Lenient matching

    const targetLower = target.toLowerCase();
    const argValues = Object.values(args)
      .map(v => String(v).toLowerCase())
      .join(" ");

    // Check if any arg contains the target keyword
    return argValues.includes(targetLower) || targetLower.split(/\s+/).some(word => argValues.includes(word));
  }
}
