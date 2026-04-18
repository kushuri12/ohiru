import { z } from "zod";
import { execa } from "execa";
import chalk from "chalk";

export const gitTools = {
  git_status: {
    description: "Get the current git status with a detailed breakdown.",
    parameters: z.object({}),
    execute: async () => {
      const { stdout } = await execa("git", ["status", "--short"]);
      return stdout || "Working tree clean.";
    },
  },

  git_diff: {
    description: "Get the diff for staged or unstaged changes.",
    parameters: z.object({
      staged: z.boolean().default(false),
      path: z.string().optional(),
    }),
    execute: async (args: any) => {
      const cmd = ["diff"];
      if (args.staged) cmd.push("--staged");
      if (args.path) cmd.push(args.path);
      const { stdout } = await execa("git", cmd);
      return stdout || "No changes.";
    },
  },

  git_commit: {
    description: "Commit staged changes with a message.",
    parameters: z.object({
      message: z.string(),
      all: z.boolean().default(false),
    }),
    execute: async (args: any) => {
      const cmd = ["commit"];
      if (args.all) cmd.push("-a");
      cmd.push("-m", args.message);
      const { stdout } = await execa("git", cmd);
      return stdout;
    }
  },

  git_push: {
    description: "Push local commits to the remote repository.",
    parameters: z.object({
      remote: z.string().default("origin"),
      branch: z.string().optional(),
    }),
    execute: async (args: any) => {
      const cmd = ["push", args.remote];
      if (args.branch) cmd.push(args.branch);
      const { stdout } = await execa("git", cmd);
      return stdout;
    }
  }
};
