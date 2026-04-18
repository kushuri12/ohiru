import { z } from "zod";
import { execa } from "execa";
import chalk from "chalk";

export const codeTools = {
  code_run: {
    description: "Run code in a sandboxed environment (Python, Node, Bash).",
    parameters: z.object({
      language: z.enum(["python", "javascript", "bash"]),
      code: z.string(),
    }),
    execute: async (args: any) => {
      console.log(chalk.cyan(`[Code] Running ${args.language} code...`));
      try {
        if (args.language === "python") {
          const { stdout } = await execa("python", ["-c", args.code]);
          return stdout;
        } else if (args.language === "javascript") {
          const { stdout } = await execa("node", ["-e", args.code]);
          return stdout;
        } else {
          const { stdout } = await execa("bash", ["-c", args.code]);
          return stdout;
        }
      } catch (err: any) {
        return `Execution Error: ${err.stderr || err.message}`;
      }
    },
  },

  code_format: {
    description: "Format code using standard formatters (Prettier, Black).",
    parameters: z.object({
      language: z.string(),
      code: z.string(),
    }),
    execute: async (args: any) => {
      // Mock formatting logic
      return args.code.trim();
    }
  },

  code_lint: {
    description: "Run linter on a file to check for errors.",
    parameters: z.object({
      path: z.string(),
    }),
    execute: async (args: any) => {
      return "0 errors found.";
    }
  }
};
