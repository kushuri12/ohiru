// packages/cli/src/tools/AgentTool.ts
import { z } from "zod";
import { HiruConfig, ProjectContext } from "shared";

/**
 * AgentTool: Inspired by Claude Code.
 * Allows the agent to spawn a recursive subagent to handle a specific subtask.
 */
export const createAgentTool = (
  agentFactory: (config: HiruConfig) => any, 
  config: HiruConfig, 
  ctxProvider: () => ProjectContext
): any => {
  return {
    description: "Spawn a subagent to handle a specific subtask or research. Use this for complex multi-step problems that can be isolated.",
    parameters: z.object({
      task: z.string().describe("The specific task for the subagent to perform.")
    }),
    execute: async (args: { task: string }) => {
      const { task } = args;
      const ctx = ctxProvider();
      
      // Initialize subagent
      const subagent = agentFactory({ ...config });
      
      try {
        // Run the task.
        const result = await subagent.runInternal(task, ctx);
        return `Subagent Result:\n${result}`;
      } catch (e: any) {
        return `Subagent Error: ${e.message}`;
      }
    }
  };
};
