// packages/cli/src/tools/UpdatePlanTool.ts
import { z } from "zod";

/**
 * UpdatePlanTool: Inspired by OpenClaw.
 * Allows the agent to update its roadmap dynamically during execution.
 */
export const UpdatePlanTool = {
  name: "update_plan",
  description: "Update the in-progress mission plan. Use this if the original plan needs adjustment based on discovery, or to mark steps as complete. Keep exactly one step 'in_progress'.",
  parameters: z.object({
    explanation: z.string().optional().describe("Short note explaining why the plan is being updated."),
    steps: z.array(
      z.object({
        number: z.number(),
        verb: z.string(),
        target: z.string(),
        status: z.enum(["pending", "in_progress", "completed"]),
      })
    ).describe("The full list of steps in the updated plan.")
  }),
  requiresPermission: false, 
  execute: async ({ steps, explanation }: any) => {
    // In Hiru, the Agent class manages the todoTracker.
    // This execution context will return the updated plan to the Agent.
    return {
      message: "Plan updated successfully.",
      explanation,
      steps
    };
  }
};
